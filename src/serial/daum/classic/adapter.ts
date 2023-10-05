import { EventLogger } from 'gd-eventlog';
import CyclingMode, { IncyclistBikeData } from '../../../modes/cycling-mode';
import {runWithRetries, waitWithTimeout} from '../../../utils/utils';
import DaumAdapter from '../DaumAdapter'
import DaumClassicCyclingMode from './modes/daum-classic';
import { DeviceProperties } from '../../../types/device';
import { SerialDeviceSettings } from '../../adapter';
import { SerialCommProps } from '../../comm';
import Daum8008 from './comms';
import { User } from '../../../types/user';
import SerialInterface from '../../serial-interface';

const PROTOCOL_NAME = "Daum Classic"
const DEFAULT_GEAR = 10;

export interface DaumClassicDeviceProperties extends DeviceProperties {
    gear?: number
}

export default class DaumClassicAdapter extends DaumAdapter<SerialDeviceSettings, DaumClassicDeviceProperties>{

    static NAME = PROTOCOL_NAME;

    protected name: string;
    protected id: string;

    constructor ( settings:SerialDeviceSettings,props?:DaumClassicDeviceProperties) {
        super(settings,props)

        const logger     = new EventLogger('DaumClassic')
        const commProps:SerialCommProps = {...this.getBikeProps(settings), logger}

        this.bike = new Daum8008( commProps )
        this.logger         = logger;
        this.name           = PROTOCOL_NAME;

        this.initData();
    }

    getBikeProps ( props:SerialDeviceSettings): SerialCommProps {
        const {port,interface: ifaceName} = props;
        let serial;
    
        if (ifaceName && typeof ifaceName ==='string') {        
            serial = SerialInterface.getInstance({ifaceName})
        }
        else {
            serial = props.interface
        }
    
        if (!serial || !serial.binding)
            throw new Error(`unknonwn interface: ${ifaceName}`)
    
        const path = `${port}` ;
        return {serial, path}
    }
    

    getName() {
        return this.name
    }

    setName(name:string) {
        this.name = name;
    }

    getProtocolName(): string {
        return PROTOCOL_NAME
    }


    getSupportedCyclingModes() : Array<any> {         
        const supported = super.getSupportedCyclingModes();
        supported.push(DaumClassicCyclingMode);
        return supported
    }

    getDefaultCyclingMode():CyclingMode {
        return new DaumClassicCyclingMode(this)        
    }


    async performCheck():Promise<boolean> {

        var info = {} as any

        const check =  new Promise(  async (resolve, reject ) => {
            this.logEvent( {message:"checking device",port:this.getPort()});
            

            try {
                await this.stop()                        
              
                const connected = await waitWithTimeout(this.connect(), 5000, ()=>{
                    this.logEvent( {message:"checking device failed", port:this.getPort(), reason:'timeout'});
                })

                if (!connected) {
                    resolve(false)
                    return;
                }
                this.stopped = false;
                               
                const address = await this.bike.getAddress() ||  {}
                info.bikeNo = address.bike;

                const version = await this.bike.getVersion() || {}
                info.serialNo = version.serialNo;                
                info.cockpit = version.cockpit                
                this.setName('Daum '+info.cockpit);

                this.pause();
                this.started = false;

                this.logEvent( {message:"checking device success",port:this.getPort(),info});
                resolve(true)               
            }
            catch (err) {
                this.logEvent( {message:"checking device failed", port:this.getPort(), reason:err.message});
                resolve(false)
            }

        })

        return await waitWithTimeout( check, 5000, ()=>{
            this.logEvent( {message:"checking device failed", port:this.getPort(), reason:'Timeout'});
            return false
        })

    }

    performStart(props:DaumClassicDeviceProperties={}, isRelaunch=false):Promise<boolean> {
        
        this.stopUpdatePull();
        

        this.setBikeProps(props)

        const user: User = this.user
        const {gear=DEFAULT_GEAR} = props


        this.initData();        

        let startState = { } as any;        
        return runWithRetries( async ()=>{
            try {
                this.logEvent({message: 'start attempt',   isRelaunch, isConnected:this.bike.isConnected()})

                if (!isRelaunch && !this.bike.isConnected()) {
                    await this.verifyConnection()
                }
                    
                await this.getBike().resetDevice();

                if ( !startState.setProg) {
                    await this.getBike().setProg(0);
                    startState.setProg = true;
                }
                if ( !startState.setPerson) {
                    await this.getBike().setPerson(user);
                    startState.setPerson = true;
                }

                if (!startState.setBikeType) {            
                    const bikeType = this.getCyclingMode().getSetting('bikeType') || 'race'                    
                    await this.getBike().setBikeType(bikeType.toLowerCase());                    
                    startState.setBikeType = true;                    
                }

                if ( !startState.startProg) {              
                    await this.getBike().startProg();
                    startState.startProg = true;
                }
                if ( !startState.setGear) {
                    await this.bike.setGear( this.cyclingData.gear || gear);    
                    startState.setGear = true;
                }

                const startRequest = this.getCyclingMode().getBikeInitRequest()
                await this.sendRequest(startRequest);
                
                startState.checkRunData = true;
                const data = await this.bike.runData();
                
                if (startRequest.targetPower && startRequest.targetPower!==25 && data.power===25) {
                    throw new Error( 'invalid device response: runData');
                }

                this.started = true;
                this.startUpdatePull();
                
                return true;
                
            }
            catch (err) {
                this.logEvent({message: 'start attempt failed',  error:err.message})
                this.started = false;
                
                if ( startState.checkRunData ) { 
                    startState = { } as any
                }
                throw( new Error(`could not start device, reason:${err.message}`));
            }
        }, 5, 1000 )
    }

    async getCurrentBikeData():Promise<IncyclistBikeData> {
        if (this.stopped)
            return;

        await this.verifyConnection()        
        return this.getBike().runData()
    }

    async getDeviceInfo():Promise<any> {
        if (this.stopped)
            return;

        const version = await this.bike.getVersion();
        return version || {}
    }

}