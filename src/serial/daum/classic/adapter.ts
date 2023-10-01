import { EventLogger } from 'gd-eventlog';
import CyclingMode, { IncyclistBikeData } from '../../../modes/cycling-mode';
import {runWithRetries} from '../../../utils/utils';
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

const getBikeProps = ( props:SerialDeviceSettings) => {

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

export default class DaumClassicAdapter extends DaumAdapter<SerialDeviceSettings, DaumClassicDeviceProperties>{

    static NAME = PROTOCOL_NAME;

    name: string;
    id: string;
    started: boolean;
    startPromise: Promise<unknown>
    checkPromise: Promise<boolean>

    constructor ( settings:SerialDeviceSettings,props?:DaumClassicDeviceProperties) {
        super(settings,props)

        const logger     = new EventLogger('DaumClassic')
        const commProps:SerialCommProps = {...getBikeProps(settings), logger}

        this.bike = new Daum8008( commProps )
        this.logger         = logger;
        this.name           = PROTOCOL_NAME;
        this.ignoreHrm      = false;
        this.ignorePower    = false;
        this.ignoreBike     = false;

        this.stopped    = false
        this.started    = false;
        this.paused     = undefined;
        this.iv         = undefined;
        this.distanceInternal = undefined;

        this.startPromise = undefined
        this.checkPromise = undefined

        this.initData();
    }

    setID(id) {
        this.id = id;
    }

    getID() {
        return this.id;
    }

    getName() {
        return this.name
    }

    setName(name) {
        this.name = name || PROTOCOL_NAME;
    }

    getPort() {
        return this.bike.getPort();
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

    getSerialInterface():SerialInterface {
        return this.bike?.serial
    }


    async check():Promise<boolean> {
        if (this.isStopped())
            return false;

        if (this.checkPromise) {
            this.logEvent( {message:"waiting for previous check device",port:this.getPort()});
            try {
                await this.checkPromise
            } catch{}
            this.logEvent( {message:"previous check device completed",port:this.getPort()});
            this.checkPromise = undefined
        }
        

        this.checkPromise = this.performCheck()
        try {
            const res = await this.checkPromise
            this.checkPromise = undefined
            return res
        }
        catch(err) {
            this.checkPromise = undefined
            throw err;
        }
    }

    async performCheck():Promise<boolean> {

        var info = {} as any

        return  new Promise(  async (resolve, reject ) => {
            this.logEvent( {message:"checking device",port:this.getPort()});

            
            const iv = setTimeout( async () => {
                this.logEvent( {message:"checking device failed", port:this.getPort(), reason:'timeout'});
                resolve(false)
            },5000)

            try {
                
                const connected = await this.connect();
                if (!connected) {
                    clearTimeout(iv);
                    resolve(false)
                    return;
                }
                
                const address = await this.bike.getAddress() ||  {}
                info.bikeNo = address.bike;
                const version = await this.bike.getVersion() || {}
                info.serialNo = version.serialNo;
                info.cockpit = version.cockpit
                this.setName('Daum '+info.cockpit);
                this.setID(info.serialNo);

                clearTimeout(iv);
                this.logEvent( {message:"checking device success",port:this.getPort(),info});
                resolve(true)               
            }
            catch (err) {
                clearTimeout(iv);
                this.logEvent( {message:"checking device failed", port:this.getPort(), reason:err.message||err});
                resolve(false)
            }

        })

    }

    async startRide(props:DaumClassicDeviceProperties={}) {
        this.logEvent({message:'relaunch of device'});
        try {        
            await this.launch(props,true)
            return true;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message})
            throw err

        }

    }

    async start(props:DaumClassicDeviceProperties={}) {



        const isRelaunch = this.started
        const message = isRelaunch ? 'relaunch of device' :'initial start of device';
        
        this.logEvent({message});

        try {
            await this.launch(props,isRelaunch)
            return true;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message})
            throw err

        }
        
    }

    async launch(props:DaumClassicDeviceProperties, isRelaunch=false) {


        try {

            if (!this.startPromise) {
                if (isRelaunch) {
                    await this.stop();              // stop the worker intervals
                    this.bike.resumeLogging()   
                }
    
                this.startPromise = this.performStart(props, isRelaunch)   
            }
            else {
                this.logEvent({message: 'start already ongoing'})

            }

            await this.startPromise
            this.startPromise = undefined
        
            if (!isRelaunch) {
                try {
                    const version = await this.bike.getVersion();
                    const {serialNo,cockpit} = version || {}
                    this.logEvent({message: 'device info', deviceInfo: {serialNo,cockpit}})
                }
                catch {}
            }

            this.logEvent({message: 'start result: success'})
            this.started = true;
            return true;
        }
        catch(err) {
            this.logEvent({message: 'start result: error', error: err.message})

            this.startPromise = undefined
            this.started = false;
            throw new Error(`could not start device, reason:${err.message}`)
        }

    }

    performStart(props:DaumClassicDeviceProperties={}, isRelaunch=false) {
        
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
                    const connected = await this.connect();
                    if (!connected) 
                        throw new Error('Could not connect')
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

                this.stopped = false;
                this.paused = false;
                this.startUpdatePull();
                
                return data;
                
            }
            catch (err) {
                this.logEvent({message: 'start attempt failed',  error:err.message})
                
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

        return this.getBike().runData()
    }


}