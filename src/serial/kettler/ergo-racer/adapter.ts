import { EventLogger } from "gd-eventlog";
import SerialComms from "../comms";
import { IncyclistBikeData } from "../../../types";
import { SerialDeviceSettings } from "../../types";
import { Command } from "../types";
import { runWithRetries, sleep } from "../../../utils/utils";
import PowerMeterCyclingMode from "../../../modes/power-meter";
import ERGCyclingMode from "../../../modes/kettler-erg";

import { SerialIncyclistDevice } from "../../base/adapter";
import SerialInterface from "../../base/serial-interface";
import { IncyclistCapability,ControllerConfig, IAdapter,IncyclistAdapterData,DeviceProperties } from "../../../types";

export interface KettlerRacerCommand extends Command  {
    
}

export interface KettlerExtendedBikeData {

}

export interface KettlerBikeData {
    heartrate?: number;
    cadence?: number;
    speed?: number;
    distance?: number;
    requestedPower?: number;
    energy?: number;
    timestamp?: number;
    time: number;
    power: number;
}


const PROTOCOL_NAME = 'Kettler Racer'

export default class KettlerRacerAdapter   extends SerialIncyclistDevice<DeviceProperties>   {
    private id: string;
    private iv : { sync: NodeJS.Timeout, update: NodeJS.Timeout };
    private requests: Array<any> = []
    private internalData: IncyclistBikeData;
    private kettlerData: KettlerBikeData;
    private updateBusy: boolean;
    private requestBusy: boolean;
    private comms: SerialComms<KettlerRacerCommand>;
    private prevDistance: number;
    
    protected static controllers: ControllerConfig = { 
        modes: [ PowerMeterCyclingMode, ERGCyclingMode],
        default:ERGCyclingMode
    }

   

    constructor ( settings:SerialDeviceSettings,props?: DeviceProperties) {
        super( settings,props);

        this.logger = new EventLogger('KettlerRacer');
        this.paused = false;
        this.iv = null;
        this.comms = new SerialComms<KettlerRacerCommand>({ interface:settings.interface, port: settings.port, logger:this.logger});
        this.capabilities = [ 
            IncyclistCapability.Power, IncyclistCapability.Speed, IncyclistCapability.Cadence, IncyclistCapability.HeartRate, 
            IncyclistCapability.Control
        ]

        
    }

    isBike(): boolean { return true; }
    isPower(): boolean { return true; }
    isHrm(): boolean { return true; }

    getProtocolName(): string {
        return PROTOCOL_NAME
    }

    isSame(device:IAdapter):boolean {
        if (!(device instanceof KettlerRacerAdapter))
            return false;
        const adapter = device as KettlerRacerAdapter;
        return  (adapter.getName()===this.getName() && adapter.getPort()===this.getPort())
    }


    setID(id) {
        this.id = id;
    }

    getID() {
        return this.id;
    }

    getName(): string {
        return this.settings.name || this.getProtocolName();
    }
    getPort(): string {
        const settings = this.settings as SerialDeviceSettings
        return settings.port;
    }

    getSerialInterface():SerialInterface {
        if (this.comms)
            return this.comms.getSerialInterface()
    }


    // -----------------------------------------------------------------
    // getters/setters
    // -----------------------------------------------------------------

    _getComms(): SerialComms<KettlerRacerCommand> { 
        return this.comms
    }
    _setComms(comms: SerialComms<KettlerRacerCommand>) { 
        this.comms = comms;
    }

    getLogger(): EventLogger {
        return this.logger;
    }



    // -----------------------------------------------------------------
    // Implementing the actual bike commands
    // -----------------------------------------------------------------

    setComputerMode() : Promise<boolean> { 
        return  this.send('setComputerMode', 'CP').then(response => {
            this.logEvent( { response } );
            if ( response === 'ACK' || response==='RUN') {
                return true;
            } else {
                return false
            }
        })                                   
    }

    setClientMode() : Promise<boolean> { 
        return  this.send('setClientMode', 'CM').then(response => {
            this.logEvent( { response } );
            if ( response === 'ACK' || response==='RUN') {                
                return true;
            } else {
                return false
            }
        })                                   
    }

    reset() : Promise<boolean> { 
        return  this.send('reset', 'RS').then(response => {
            this.logEvent( { response } );
            if ( response === 'ACK' || response==='RUN') {
                return true;
            } else {
                return false
            }
        })                                   
    }

    getIdentifier() : Promise<string> { 
        return  this.send('getIdentifier', 'ID').then ( response => {            
            this.logEvent( { response } );
            return response.substring(0, 3)
        })
    }

    async getKettlerInterface() : Promise<string> { 
        const res =   await this.send('getInterface', 'KI');
        this.logEvent( { interface: res } );
        return res;

    }

    async getVersion() : Promise<string> { 
        const res =   await this.send('getVersion', 'VE');
        this.logEvent( { version: res } );
        return res;
    }

    async getCalibration() : Promise<string> { 
        return  await this.send('getCalibration', 'CA');
    }

    async startTraining() : Promise<string> { 
        return  await this.send('startTraining', 'LB');
    }

    async unknownSN() : Promise<string> { 
        return  await this.send('SN', 'SN');
    }

    async setBaudrate( baudrate: number) : Promise<string> { 
        return  await this.send(`setBaudrate(${baudrate})`, `BR${baudrate}`);
    }

    async setPower( power: number) : Promise<KettlerBikeData> { 
        return  this.send(`setPower(${power})`, `PW${power}`).then( response => { 
            const data = this.parseStatus(response);
            return data
        })
    }

    getExtendedStatus() : Promise< KettlerExtendedBikeData> { 
        return  this.send('getExtendedStatus', 'ES1').then ( response => {                        
            const data = this.parseExtendedStatus(response);
            return data
        })
    }

    getStatus() : Promise< KettlerBikeData> { 
        return  this.send('getStatus', 'ST').then ( response => {                        
            const data = this.parseStatus(response);
            return data
        })
    }

    async getDB() : Promise<string> { 
        return await this.send('getDB', 'DB');
    }

    /**
     * send a command to the bike
     * 
     * @param logStr
     * @param message
     * @param params
     * @returns {Promise<any>}
     * @memberof KettlerRacerAdapter
     * 
     **/
    async send( logStr: string, message:string, timeout? ): Promise<any> {

        return new Promise( async (resolve,reject) => {
            try {
                const opened = await this.waitForOpened();
                if ( !opened ) {
                    reject (new Error('connection error'))
                }
            }
            catch (err) { reject(err) }
                
            this.comms.send( {logStr, message, onResponse: resolve, onError:reject,  timeout} ) 

        });
    }

    /**
     * parse the result of the extended status (ES1) command and transform it into a more usable object
     * 
     * @param data  the data returned by the ES1 command
     * @returns {KettlerExtendedBikeData}   the parsed data
     * @memberof KettlerRacerAdapter
     * 
     **/
    parseExtendedStatus(data: string): KettlerExtendedBikeData {
        // TODO
        const result = {} as KettlerExtendedBikeData;
        return result;
    }


    /**
     * parse the result of the status (ST) command and transform it into a more usable object
     * 
     * @param data  the data returned by the ST command
     * @returns {KettlerExtendedBikeData}   the parsed data
     * @memberof KettlerRacerAdapter
     * 
     **/
     parseStatus(data: string): KettlerBikeData {
        // TODO


        const states = data.split('\t');
        const result = {} as KettlerBikeData;

		// ST response format
		//      101     047     074    002     025      0312    01:12   025
		//info: 0       1       2       3       4       5       6       7
		//0: heart rate as bpm (beats per minute)
		//1: cadence as rpm (revolutions per minute)
		//2: speed as 10*km/h -> 074=7.4 km/h
		//3: distance in 100m steps
		//   in non-PC mode: either counting down or up, depending on program
		//   in PC mode: can be set with "pd x[100m]", counting up
		//4: power in Watt, may be configured in PC mode with "pw x[Watt]"
		//5: energy in kJoule (display on trainer may be kcal, note kcal = kJ * 0.2388)
		//   in non-PC mode: either counting down or up, depending on program
		//   in PC mode: can be set with "pe x[kJ]", counting up
		//6: time minutes:seconds,
		//   in non-PC mode: either counting down or up, depending on program
		//   in PC mode: can be set with "pt mmss", counting up
		//7: current power 
		if (states.length === 8) {
			const hr = parseInt(states[0]);
			if (!isNaN(hr)) {
				result.heartrate = hr;
			}

			// cadence
			var cadence = parseInt(states[1]);
			if (!isNaN(cadence)) {
				result.cadence = cadence;
			}

			// speed
			const speed = parseInt(states[2]);
			if (!isNaN(speed)) {
				result.speed = speed * 0.1;
			}

            const distance = parseInt(states[3]);
            if (!isNaN(distance)) { 
                result.distance = distance*100;
            }

			// power in Watt
			const requestedPower = parseInt(states[4]);
			if (!isNaN(requestedPower)) {
				result.requestedPower = requestedPower;
			}

            const energy = parseInt(states[5]);
			if (!isNaN(energy)) {
				result.energy = energy;
			}

            const timeStr = states[6];
            const time = timeStr.split(':');
            const hours = parseInt(time[0]);
            const minutes = parseInt(time[1]);
            if (!isNaN(hours) && !isNaN(minutes)) {
                result.time = hours * 60 + minutes;
            }

            const power = parseInt(states[7]);
            if (!isNaN(power)) {
                result.power = power;
            }

            result.timestamp = Date.now();

		}

        return result;
    }

    // -----------------------------------------------------------------
    // Mapping Bike Commands to Adapter Commands
    // -----------------------------------------------------------------

    // check if we can communicate with bike
    async check(): Promise<boolean> {
        
        var info = {} as any

        return new Promise(  async (resolve, reject ) => {
            this.logEvent( {message:"checking device",port:this.getPort()});
            
            let iv = undefined;
            try {

                if (!info.opened) 
                    info.opened = await this.waitForOpened();

                iv = setTimeout( () => {
                    this.logEvent( {message:"checking device failed", port:this.getPort(), reason:'timeout'});
                    resolve(false)
                },5000)


                if (!info.pcMode)
                    info.pcMode = await this.setClientMode();
                if (!info.id)
                    info.id = await this.getIdentifier();

                if (!info.version)
                    info.version = await this.getVersion();

                try { await this.getKettlerInterface() } catch (e) { this.logEvent( {message:'could not get kettler interface', error:e.message})}
              

                clearTimeout(iv);
                this.logEvent( {message:"checking device success",port:this.getPort(),info});

                resolve(true)               
            }
            catch (err) {
                this.logEvent( {message:"checking device failed", port:this.getPort(), reason:err.message||err});
                if (iv) clearTimeout(iv);                    
                iv = undefined;
                resolve(false)
            }

        })

    }

    // start a training session
    async start(startProps?: any): Promise<boolean> {
        const props = this.getStartProps(startProps)

        this.logEvent({message:'start()'});        
        
        var info = {} as any

        await this.waitForOpened(true);
        
        return runWithRetries( async ()=>{
            try {
                if (!info.checkDone) {
                    info.checkDone = await this.check();                    
                }

                try { 
                    if (!info.started) { 
                        info.started = await this.startTraining();
                    }
                } catch (e) { this.logEvent( {message:'Error', error:e.message})}

                // try to set initial power, ignore errors
                try { await this.setPower(100) } catch (e) { this.logEvent( {message:'Error', error:e.message})}

                
                if (!info.data) { 
                    await this.update();
                    info.data = this.data;
                }
                
                return info.data;
            }
            catch(err) {
                try { await this.reset() } catch (e) { this.logEvent( {message:'Error', error:e.message})}

                throw( new Error(`could not start device, reason:${err.message}`));

            }

        }, 5, 1000 )
        .then ( (data: IncyclistBikeData)     => {
            this.startUpdatePull();
            return true;
        })        
    }

    startUpdatePull() { 
        
        // ignore if already  started
        if (this.iv)
            return;

        this.logEvent({message:'start regular device update'});

        const ivSync = setInterval( ()=>{
            this.bikeSync();            
        }, this.pullFrequency)

        const ivUpdate = setInterval( ()=>{
            this.emitData(this.data);
            this.refreshRequests()
        }, this.pullFrequency)

        this.iv = {
            sync: ivSync,
            update: ivUpdate
        }
    }

    canEmitData(): boolean {
        return !this.isPaused()
    }

    // stop a training session
    stop(): Promise<boolean> {

        this.logEvent({message:'stop request'});        
        
        return new Promise( async (resolve,reject) => {
            try {
                if ( this.iv ) {
                    if ( this.iv.sync) clearInterval(this.iv.sync);
                    if ( this.iv.update) clearInterval(this.iv.update);
                    this.iv=undefined
                }

                await this.waitForClosed();
                this.logEvent({message:'stop request completed'});        
                this.paused=undefined;
                resolve(true);
            }
            catch (err) {
                this.logEvent({message:'stop error',error:err.message});        
                this.paused=undefined;
                reject(err);
            }
        })
        
    }


    mapData( bikeData: KettlerBikeData): IncyclistBikeData {
        let data = {} as any;      
        data.isPedalling = bikeData.cadence>0;
        data.power  = bikeData.power
        data.pedalRpm = bikeData.cadence
        data.speed = bikeData.speed;
        data.heartrate = bikeData.heartrate
        data.distanceInternal = bikeData.distance;
        data.time = bikeData.time;       
        return data;
    }

    transformData( internalData: IncyclistBikeData, bikeData:KettlerBikeData): IncyclistAdapterData {
        let data = {} as IncyclistAdapterData;

        const prevDistance =this.prevDistance || 0;
        let distance = internalData.distanceInternal - prevDistance
        if (distance<0) distance = internalData.distanceInternal<100 ? internalData.distanceInternal : 0;

        data.heartrate = internalData.heartrate;
        data.timestamp = Date.now();
        data.deviceTime = bikeData.time;
        data.speed = internalData.speed;
        data.power = internalData.power;
        data.cadence = internalData.pedalRpm;
        data.distance = distance;
        data.deviceDistanceCounter = bikeData.distance;
        data.internalDistanceCounter = internalData.distanceInternal;

        this.prevDistance = internalData.distanceInternal;
       
        return data;
    }

    /**
     * get the latest data from the bike and update the internal data - with support of the cyclingMode
     **/

    async update(): Promise<void> {
        this.updateBusy = true;

        return this.getStatus()
        .then( (bikeData: KettlerBikeData) => {
            if ( bikeData) {
                try {
                    this.kettlerData = bikeData;
    
                    let data = this.mapData(bikeData);
                    data = this.getCyclingMode().updateData(data);
                    this.internalData = data;
                    this.data = this.transformData(data,bikeData);
                    this.emitData(this.data)
        
                }
                catch( err) {
                    this.logEvent({message:'bike update error',error:err.message})
                }    
            }                
            this.updateBusy = false;
        })
        .catch(err => {
            this.logEvent({message:'bike update error',error:err.message})
            this.updateBusy = false;
        })

    }

    async sendRequest(request) {
        this.requestBusy = true;
        try {
            this.logEvent({message:'sendRequest',request})
            
            const isReset = ( !request || request.reset || Object.keys(request).length===0 );

            if (isReset) {
                this.requestBusy = false;
                return {};
            }
               
            if (request.slope!==undefined) {
                this.data.slope = request.slope;
            }
            if (request.targetPower!==undefined ) {
                await this.setPower(request.targetPower);
            }
            this.requestBusy = false;
            return request
        
        }
        catch (err) {
            this.requestBusy = false;
            this.logEvent( {message:'error',fn:'sendRequest()',error:err.message||err})            
            return;
        }


    }
    async sendRequests() {
        // if we have updates, send them to the device
        if (this.requests.length>0) {
            const processing  =[...this.requests];

            // ignore previous requests, only send last one
            const cnt = processing.length;
            processing.forEach( async (request,idx) => {
                if (cnt>1 && idx<cnt-1) {
                    this.logEvent({message:'ignoring bike update request',request})
                    this.requests.shift();
                    return;
                }
            })

            // at this point we should have only one request remaining
            const request = processing[0]

            try {
                await this.sendRequest(request);                                   
                this.requests.shift();

            }
            catch (err) {
                this.logEvent({message:'bike update error',error:err.message,stack:err.stack,request})
            }
            
        }    

    }




    async bikeSync() {

        // don't send any commands if we are pausing
        if( this.paused) {
            return;
        }

        // don't updat if device is still busy with previous cycle
        if (this.updateBusy || this.requestBusy) {
            return;
        }

        this.logEvent({message:'bikeSync'});
        await this.sendRequests();
        await this.update()
    

    }

    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused)
            return;
        
        this.logEvent({message:'sendUpdate',request,waiting:this.requests.length});    
        return await this.processClientRequest(request);
    } 

    refreshRequests() {
        // not pedaling => no need to generate a new request
        if ( this.kettlerData?.cadence===0) 
            return;

        let bikeRequest = this.getCyclingMode().sendBikeUpdate({refresh:true}) || {}
        const prev = this.requests[this.requests.length-1] || {};

        if (bikeRequest.targetPower!==undefined && bikeRequest.targetPower!==prev.targetPower) {
            this.logEvent({message:'add request',request:bikeRequest})
            this.requests.push(bikeRequest);
        }
    }


    processClientRequest(request) {
        if ( request.slope!==undefined) {
            this.data.slope = request.slope;
        }
        
        return new Promise ( async (resolve) => {
            let bikeRequest = this.getCyclingMode().sendBikeUpdate(request)
            this.logEvent({message:'add request',request:bikeRequest})
            this.requests.push(bikeRequest);
            resolve(bikeRequest);
        })
    }

    async connect(): Promise<boolean> {
        return await this.waitForOpened(true)
    }

    async close(): Promise<boolean> {
        return await this.waitForClosed()
    }


    async waitForOpened( retries: boolean = false): Promise<boolean> {

        if (!retries) {
            return await this.comms.open()
        }
        else  {
            let opened;
            let tries = 0;

            while (!opened && tries<3) {
                try {
                    opened = await this.comms.open()
                    if (opened) return true;
                }
                catch(err) {

                }
                tries++;
                await sleep(500)
            }   
            return false;
        }
    }

    waitForClosed(): Promise<boolean> {
           
        return new Promise ( (resolve, reject) => {
            try {

                if ( !this.comms.isConnected() ) {
                    resolve(true);
                    return;
                }

                const cleanup = () => { 
                    this.comms.removeAllListeners();
                }
                const onClose = () => {
                    resolve(true); 
                    cleanup();
                }
                const onError = (err) => {reject(err); cleanup(); }
                const onOpen = () => { cleanup() }

                this.comms.on('closed', onClose);
                this.comms.on('opened', onOpen);
                this.comms.on('error', onError); 

                this.logEvent( {message:'closing',port:this.getPort()})
                this.comms.close()

        
                
            }
            catch( err ) {
                this.logEvent( {message:'error',fn:'waitForClosed()',error:err.message||err})
                reject(err);
            }

        })
    
    }

 



}