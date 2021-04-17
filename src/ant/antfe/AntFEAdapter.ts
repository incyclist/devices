import { EventLogger } from 'gd-eventlog';
import AntAdapter from '../AntAdapter';
import { AntProtocol } from '../AntScanner';
import {getBrand} from '../utils'
import {Queue,hexstr} from '../../utils'

const floatVal = (d) => d ? parseFloat(d) :d
const intVal = (d) => d ? parseInt(d) :d

const TIMEOUT_ACK = 5000;
const TIMEOUT_START = 10000;

export default class AntFEAdapter extends AntAdapter {

    started: boolean;
    starting: boolean;
    connected: boolean;
    distanceInternal?: number;
    queue?: Queue<any>;
    workerId?: any;
    currentCmd?: any;

    constructor( DeviceID,port,stick, protocol) {
        super(protocol)

        this.logger = new EventLogger('Ant+FE')
        this.deviceID = DeviceID;
        this.port = port;
        this.stick = stick;
        this.deviceData = {
            DeviceID
        }
        this.data = {}
        this.started = false;
        this.starting = false;
        this.connected = false;
    }

    isBike() { return true;}
    isHrm() { return this.deviceData.HeartRate!==undefined;}
    isPower() { return true; }
   
    getProfile() {
        return 'Smart Trainer';
    }

    getName() {
        return `Ant+FE ${this.deviceID}`        
    }

    getDisplayName() {
        const {DeviceID,ManId,ComputedHeartRate} = this.deviceData;
        const hrmStr = ComputedHeartRate ? ` (${ComputedHeartRate})` : '';
        return `${getBrand(ManId)} FE ${DeviceID}${hrmStr}`
    }

    onAttached() {

        this.connected = true;

    }



    onDeviceData( deviceData) {
        if (!this.started)
            return;
        this.deviceData = deviceData;
        try {
            if ( this.onDataFn && !(this.ignoreHrm && this.ignoreBike && this.ignorePower) && !this.paused) {
                if (!this.lastUpdate || (Date.now()-this.lastUpdate)>this.updateFrequency) {
                    this.data = this.updateData(this.data,deviceData)
                    const data = this.transformData(this.data);                    
                    this.onDataFn(data)
                    this.lastUpdate = Date.now();
                }
            }    
        }
        catch ( err) {
        }
    }

    onDeviceEvent(data) {
        try {
            let stick = this.stick;
            const msg = this.currentCmd && this.currentCmd.msg ? this.currentCmd.msg.readUInt8(2): '';

            const cmdInfo = this.currentCmd || {};
            const Constants = this.getProtocol().getAnt().Constants;
            const {expectedResponse} = cmdInfo;

            if ( this.currentCmd!==undefined && data.message===msg && expectedResponse===undefined && data.code===0 /*Constants.EVENT_TRANSFER_TX_COMPLETED*/) {
                this.currentCmd.response = { success:true }
                return;
            }

            if ( this.currentCmd!==undefined && data.message===msg && data.code!==0 /*Constants.EVENT_TRANSFER_TX_COMPLETED*/) {
                this.currentCmd.response = { success:false}
                return;
            }

            if ( this.currentCmd!==undefined && data.message===1 && expectedResponse===undefined && (data.code===5 || data.code===3) /*Constants.EVENT_TRANSFER_TX_COMPLETED*/) {
                this.currentCmd.response = { success:true }
                return;
            }
            if ( this.currentCmd!==undefined && data.message===1 && expectedResponse!==undefined && data.code===expectedResponse) {
                this.currentCmd.response = { success:true }
                return;
            }


            if ( this.currentCmd!==undefined && data.message===1 && data.code===6 /*Constants.EVENT_TRANSFER_TX_FAILED*/)  { 
                this.stick.write(this.currentCmd.msg);
                this.currentCmd.response = { success:false }
                return;
            }
            if ( this.currentCmd!==undefined && data.message===Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA && data.code===31) {
                this.logger.log("could not send (TRANSFER_IN_PROGRESS)");
                return;
            }
            this.logger.logEvent({message:"Incoming Event ", event:data} );
    
        }
        catch (err) {
            this.logger.logEvent({message:'Error',fn:'parseEvent',data:hexstr(data),error:err.message})
        }
    }


    updateData( data,deviceData) {

        // update data based on information received from ANT+FE sensor
        if (data.distanceOffs===undefined) data.distanceOffs=0;
        data.speed = (deviceData.VirtualSpeed!==undefined ? deviceData.VirtualSpeed : deviceData.RealSpeed)*3.6;
        data.slope = (deviceData.Incline!==undefined? deviceData.Incline :data.slope);
        data.power = (deviceData.InstantaneousPower!==undefined? deviceData.InstantaneousPower :data.power);
        data.pedalRpm = (deviceData.Cadence!==undefined? deviceData.Cadence :data.pedalRpm) ;
        data.heartrate = ( deviceData.HeartRate!==undefined ? deviceData.HeartRate : data.heartrate);
        if ( deviceData.Distance!==undefined) {
            data.distanceInternal = deviceData.Distance-data.distanceOffs;
            data.distance = data.distanceInternal/1000;
        }

        return data;
    }


    transformData( bikeData) {

        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance = intVal(bikeData.distanceInternal-this.distanceInternal)
        }
        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        

        let data =  {
            speed: floatVal(bikeData.speed),
            slope: floatVal(bikeData.slope),
            power: intVal(bikeData.power),
            cadence: intVal(bikeData.pedalRpm),
            heartrate: intVal(bikeData.heartrate),
            distance,
            timestamp: Date.now()
        } as any;

        if (this.ignorePower) { 
            delete data.power;
            delete data.cadence;
        }
        if (this.ignoreBike) {
            data = { heartrate: data.heartrate};
        }
        if (this.ignoreHrm) delete data.heartrate;

        return data;
    }




    async start(props?) {
        this.logger.logEvent({message:'start()'});        
        const opts = props || {} as any

        return new Promise( async (resolve,reject) => {
            if(this.ignoreHrm && this.ignoreBike && this.ignorePower)
                return resolve(false)

            if (this.starting) {
                return resolve(false)
            } 

            if ( this.started) {
                return resolve(true);
            }

            this.starting = true;
            const Ant = this.getProtocol().getAnt();
            const protocol = this.getProtocol() as AntProtocol;

            protocol.attachSensors(this,Ant.FitnessEquipmentSensor,'fitnessData')
                .then( async ()=> {
                    this.startWorker();

                    const tsStart = Date.now();
                    const iv = setInterval( async ()=>{
                        if ( this.connected) {
                            clearInterval(iv);
                            try {
                                await this.sendTrackResistance(0.0);
                                await this.sendUserConfiguration( opts.userWeight||72, opts.bikeWeight||12.75, opts.wheelDiameter, opts.gearRatio);
                            }
                            catch(err) {
                                console.log('~~~err:',err)
                            }
                            this.started = true;
                            this.starting = false;
                            resolve(true)
                        }
                        else if ( (Date.now()-tsStart)>TIMEOUT_START) {
                            clearInterval(iv);
                            this.started = true;
                            try {
                                await protocol.detachSensor(this);
                            }
                            catch(err){}
                            this.starting = false;
                            reject( new Error('timeout'))

                        }
                    } , 50)

                })
                .catch(err=> {
                    this.starting = false;
                    reject(err)
                })
        })
    }

    
    stop(): Promise<boolean>  {
        this.logger.logEvent({message:'stop()'});        
        this.stopWorker();

        const Messages = this.getProtocol().getAnt().Messages;
        const stick = this.stick;
        const channel = this.channel;

        stick.write(Messages.openChannel(channel));

        return new Promise( async (resolve,reject) => {

            // Workaround: proper closing does not work -> when trying to re-open, the sensor does not get attached
            //return resolve(true);

            

            if(!this.started && !this.connected) 
                return resolve(false)

            try {
                const protocol = this.getProtocol() as AntProtocol;
                await protocol.detachSensor(this);
                this.started = false;
                this.connected = false;

                resolve(true)
            }
            catch( err) 
            {
                this.connected = false;
                reject(err);
            }                
            
        });
    }

    async sendUpdate(request) {
        this.logger.logEvent({message:"sendBikeUpdate():",request}) ;

        try {
            if (request.slope!==undefined) {
                await this.sendTrackResistance(request.slope);
            }
    
            if (request.targetPower!==undefined) {
                await this.sendTargetPower(request.targetPower);
            }
            else if (request.maxPower!==undefined) {
                if ( this.data.power && this.data.power>request.maxPower)
                    await this.sendTargetPower(request.maxPower);
            }
            else if (request.minPower!==undefined) {
                if ( this.data.power && this.data.power<request.minPower)
                    await this.sendTargetPower(request.minPower);
            }
    
            if ( request.maxHrm!==undefined) {
                // TODO
            }
            if (request.minHrm!==undefined) {
                // TODO
            }    
    
        }
        catch( err) {
            this.logger.logEvent( {message:'sendBikeUpdate() error',error:err.message})
        }


    }

    
    send(msg,logStr, callback?,expectedResponse?) {        
        if (this.workerId===undefined ) {
            return;
        }
        this.queue.enqueue( { msg, logStr, callback,expectedResponse} );
    }

    sendAsync(msg,logStr,expectedResponse) {       
        return new Promise( (resolve,reject) => {
            this.send(msg,logStr, (res,err)=> {
                if (err)
                    return reject(err)
                resolve(res);
            },expectedResponse)
        })  
    }

    startWorker() {
        if (this.queue===undefined) {
            this.queue=new Queue();
        }
        this.workerId = setInterval( ()=>{this.sendFromQueue()}, 10);
    }

    stopWorker() {
        if(!this.workerId) 
            return;
        clearInterval(this.workerId);
        this.queue.clear();
        this.workerId=undefined;
    }

    sendFromQueue() {
        if (this.queue===undefined)
            return;
            
        if (this.currentCmd!==undefined) {
            const cmdInfo = this.currentCmd;

            if (this.currentCmd.response===undefined) {
                const {callback,logStr,tsStart} = cmdInfo;
                let timeout = cmdInfo.timeout;
                if (timeout===undefined) timeout = TIMEOUT_ACK ;
                
                let duration = Date.now()-tsStart;
                if (duration>timeout) {
                    this.logger.logEvent({ message:'timeout',cmd:logStr,timeout:`${timeout}ms`});
                    this.currentCmd=undefined;
                    if (callback!==undefined) {
                        callback( undefined, new Error('timeout') )
                    }
                }
                
            }
            else {
                const {callback,response,logStr} = cmdInfo;
                this.logger.logEvent({message:"response: ",cmd:logStr,response});
                this.currentCmd=undefined;
                if (callback!==undefined) {
                    if ( response && response.success===false) {
                        callback(undefined, new Error('error'))
                        return;
                    }
                    callback( response )
                }
                
            }
        }
        else {
            if (this.queue.isEmpty())
                return;

            this.currentCmd = this.queue.dequeue();

            this.currentCmd.tsStart = Date.now();
            const {msg,logStr} = this.currentCmd;
            this.logger.logEvent({message:"sending",cmd:logStr,msg:hexstr(msg),queueSize:this.queue.size()} );
            this.stick.write(msg);
        }
    }

    /*
    ====================================== Commands ==============================================
    */

    sendUserConfiguration (userWeight, bikeWeight, wheelDiameter, gearRatio) {
        if (!this.connected)
            return;
        return new Promise( (resolve,reject) => {


            var payload = [];
            payload.push ( this.channel);
    
            const logStr = `sendUserConfiguration(${userWeight},${bikeWeight},${wheelDiameter},${gearRatio})`
    
            var m = userWeight===undefined ? 0xFFFF : userWeight;
            var mb = bikeWeight===undefined ? 0xFFF: bikeWeight;
            var d = wheelDiameter===undefined ? 0xFF : wheelDiameter;
            var gr = gearRatio===undefined ? 0x00 : gearRatio;
            var dOffset = 0xFF;
    
            if (m!==0xFFFF)
                m = Math.trunc(m*100);
            if (mb!==0xFFF)
                mb = Math.trunc(mb*20);        
            if (d!==0xFF) {
                d = d*1000;
                dOffset = d%10;
                d = Math.trunc(d/10);
            }
            if (gr!==0x00) {
                gr= Math.trunc(gr/0.03);
            }
    
            payload.push (0x37);                        // data page 55: User Configuration
            payload.push (m&0xFF);                      // weight LSB
            payload.push ((m>>8)&0xFF);                 // weight MSB
            payload.push (0xFF);                        // reserved
            payload.push (((mb&0xF)<<4)|(dOffset&0xF)); //  bicycle weight LSN  and 
            payload.push ((mb>>4)&0xF);                 // bicycle weight MSB 
            payload.push (d&0xFF);                      // bicycle wheel diameter 
            payload.push (gr&0xFF);                     // gear ratio 
    
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
                
            this.send( msg, logStr, (res,err)=> {
                if (err)
                    return reject(err)
                resolve(res);
            });
        });

    }

    sendBasicResistance( resistance) {
        if (!this.connected)
            return;

        return new Promise( (resolve,reject) => {
            var payload = [];
            payload.push ( this.channel);
    
            const logStr = `sendBasicResistance(${resistance})`;
    
            var res = resistance===undefined ?  0 : resistance;
            
            res = res / 0.5;
    
            payload.push (0x30);                        // data page 48: Basic Resistance
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (res&0xFF);                    // resistance 
    
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
                
            this.send( msg, logStr, (res,err)=> {
                if (err)
                    return reject(err)
                resolve(res);
            });
        });

    }

    sendTargetPower( power) {
        if (!this.connected)
            return;

        return new Promise( (resolve,reject) => {
            var payload = [];
            payload.push ( this.channel);
    
            const logStr = `sendTargetPower(${power})`;
    
            var p = power===undefined ?  0x00 : power;
    
            p = p * 4;
            payload.push (0x31);                        // data page 49: Target Power
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (p&0xFF);                      // power LSB
            payload.push ((p>>8)&0xFF);                 // power MSB 
    
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
    
            this.send( msg, logStr, (res,err)=> {
                if (err)
                    return reject(err)
                resolve(res);
            });
        });

    }

    sendWindResistance( windCoeff,windSpeed,draftFactor) {
        if (!this.connected)
            return;

        return new Promise( (resolve,reject) => {
            var payload = [];
            payload.push ( this.channel);
    
            const logStr = `sendWindResistance(${windCoeff},${windSpeed},${draftFactor})`;
    
            var wc = windCoeff===undefined ? 0xFF : windCoeff;
            var ws = windSpeed===undefined ? 0xFF : windSpeed;
            var df = draftFactor===undefined ? 0xFF : draftFactor;
    
            if (wc!==0xFF) {
                wc = Math.trunc(wc/0.01);
            }
            if (ws!==0xFF) {
                ws = Math.trunc(ws+127);
            }
            if (df!==0xFF) {
                df = Math.trunc(df/0.01);
            }
    
            payload.push (0x32);                        // data page 50: Wind Resistance
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (wc&0xFF);                     // Wind Resistance Coefficient
            payload.push (ws&0xFF);                     // Wind Speed
            payload.push (df&0xFF);                     // Drafting Factor
    
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
            this.send( msg, logStr, (res,err)=> {
                if (err)
                    return reject(err)
                resolve(res);
            });
        });

    }

    sendTrackResistance( slope, rrCoeff?) {
        if (!this.connected)
            return;

        return new Promise( (resolve,reject) => {
            var payload = [];
            payload.push ( this.channel);
            
            const logStr = `sendTrackResistance(${slope},${rrCoeff})`;
    
            var s  = slope===undefined ?  0xFFFF : slope;
            var rr = rrCoeff===undefined ? 0xFF : rrCoeff;
    
            if (s!==0xFFFF) {
                s = Math.trunc((s+200)/0.01);
            }
            if (rr!==0xFF) {
                rr = Math.trunc(rr/0.00005);
            }
    
            payload.push (0x33);                        // data page 51: Track Resistance 
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (0xFF);                        // reserved
            payload.push (s&0xFF);                      // Grade (Slope) LSB
            payload.push ((s>>8)&0xFF);                 // Grade (Slope) MSB
            payload.push (rr&0xFF);                     // Drafting Factor
    
            const Messages = this.protocol.getAnt().Messages;
            let msg = Messages.acknowledgedData(payload);
            this.send( msg, logStr, (res,err)=> {
                if (err)
                    return reject(err)
                resolve(res);
            });
    
        })
    }
    
}


