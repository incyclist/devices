/* eslint-disable react-hooks/rules-of-hooks */
import { sleep } from '../../../utils/utils'
import { User } from '../../../types/user'
import { ClassicBikeResponse, DaumClassicCommsState, DaumClassicRequest, DaumClassicResponse, GetVersionReponse, ProgResponse, SetGearRepsonse, SetPowerRepsonse, SetProgResponse, SetSlopeRepsonse, checkCockpitReponse } from './types'
import SerialPortComms from '../../comms'
import { ResponseTimeout } from '../premium/types'
import { DEFAULT_AGE, between, buildSetSlopeCommand, getBikeType, getCockpit, getGender, getLength, getSerialNo, getWeight, parseRunData } from './utils'
import { DeviceType } from '../../../types/device'
import { IncyclistBikeData } from '../../..'
const ByteLength = require('@serialport/parser-byte-length')


const TIMEOUT_SEND  = 2000;    // 2s

export default class Daum8008 extends SerialPortComms<DaumClassicCommsState,DaumClassicRequest, DaumClassicResponse > {

    validatePath(path:string): string {
        return path;
    }

    /* istanbul ignore next */ 
    getDefaultLoggerName():string {
        return 'DaumClassic'
    }

    onConnected():void {
        
    }

    getTimeoutValue() {
        return TIMEOUT_SEND
    }

    async initForResponse(expected) {        

        const parser = this.portPipe(new ByteLength({length: expected}))
        if (!parser)
            return;

        parser.on('data', (data:Uint8Array) => {
            this.portUnpipe();
            this.recvState.data.enqueue({type:'Response',data})
        })
    }

    async waitForResponse():Promise<DaumClassicResponse> {
        const timeout = this.getTimeoutValue()
        let waitingForResponse = true;
        let start = Date.now()
        let tsTimeout = start+timeout

        while( waitingForResponse && Date.now()<tsTimeout) {
            const response = this.recvState.data.dequeue()
            if (response) {
                return response
            }
            await sleep(5)
            
        }
        throw new ResponseTimeout()
    }

    async doSend(expected:number, payload:Uint8Array):Promise<DaumClassicResponse> {
       
        this.initForResponse(expected)
        await this.write( Buffer.from(payload ))            
        const response = await this.waitForResponse()

        if(response.type==='Error')
            throw response.error

        if ( response.data[0]!==payload[0] ) {
            this.portFlush();
            throw new Error('illegal response')
        }

        return response;
    }

    async send( request:DaumClassicRequest):Promise<DaumClassicResponse> {
        const {expected, command,logString} = request
        
        const payload = Array.isArray(command)  ?  new Uint8Array(command) : command


        let logPayload =  {
            port:this.path,
            cmd: logString||'BinaryCommand',
        }

        await this.ensurePrevCmdFinish(logPayload);

        this.sendCmdPromise =  new Promise ( async (resolve,reject) => {
   
            try {    
                this.logEvent({message:"sendCommand:sending:",...logPayload, hex:Buffer.from(payload).toString('hex')});

                await this.ensureConnection()                
                const res = await this.doSend(expected,payload)

                this.logEvent({message:"sendCommand:received:",...logPayload, hex:Buffer.from(res.data).toString('hex')});
                this.sendCmdPromise = null;
                resolve(res)
    
            }
            catch (err)  {
                this.logEvent({message:"sendCommand:error:",...logPayload,error:err.message});
                this.sendCmdPromise = null;

                reject(err)
            }          
    
        });

        return this.sendCmdPromise        

    }

    async sendCommand(logString:string, command:number[], expected):Promise<Uint8Array> {
        const response = await this.send( {logString,command,expected})
        return response.data;
    }
 

    /*
    ====================================== Commands ==============================================
    */

    async checkCockpit(bikeNo:number=0):Promise<checkCockpitReponse> {
        try {
            const data = await this.sendCommand( `checkCockpit(${bikeNo})`,[0x10,bikeNo],3)
            return {bike : data[1], version: data[2]}
        }
        catch(err) {
            // ignore Repsonse timeout as some devices don't respond on this command
            if (err instanceof ResponseTimeout)
                return {bike : bikeNo, version: undefined}
            throw err
        }
    }

    async getAddress():Promise<ClassicBikeResponse> {
        const data = await this.sendCommand(`getAddress()`,[0x11],2)
        return {bike:data[1]};
    }

    async getVersion(bikeNo:number=0):Promise<GetVersionReponse> {
        const data = await this.sendCommand(`getVersion(${bikeNo})`, [0x73,bikeNo],11)
        return {bike : data[1], serialNo: getSerialNo(data,2,8), cockpit:getCockpit(data[10])}
    }

    async resetDevice(bikeNo:number=0):Promise<ClassicBikeResponse> {
        const data = await this.sendCommand(`resetDevice(${bikeNo})`,[0x12,bikeNo],2)
        return {bike:data[1]};
    }

    async startProg(bikeNo:number=0):Promise<ProgResponse> {
        const data = await this.sendCommand(`startProg(${bikeNo})`, [0x21,bikeNo],3)
        return {bike : data[1], pedalling:data[2]>0};
    }

    async stopProg(bikeNo:number=0):Promise<ProgResponse> {
        const data = await this.sendCommand(`stopProg(${bikeNo})`,[0x22,bikeNo],3)
        return {bike : data[1], pedalling:data[2]>0};
    }

    async setProg(progNo:number=0,bikeNo:number=0):Promise<SetProgResponse> {
        const data = await this.sendCommand(`setProg(${bikeNo},${progNo})`, [0x23,bikeNo,progNo],4)
        return {bike:data[1],progNo:data[2],pedalling:data[3]!==0};
    }

    async setBikeType(bikeType:DeviceType,bikeNo=0):Promise<ClassicBikeResponse> {
        const bikeVal = getBikeType( bikeType)        
        const data = await this.sendCommand(`setBikeType(${bikeNo},${bikeType})`, [0x69,bikeNo,0,0,bikeVal],3)
        return {bike:data[1]};
    }

    async setPerson(user:User={},bikeNo:number=0) {
        const age = user.age!==undefined ? user.age : DEFAULT_AGE;
        const gender = getGender( user.sex) ;    
        const length = getLength( user.length) ;  
        const maxPower = 800

        const mUser = user.weight 
        const weight = getWeight( mUser)+10 // adding weight of bike    
        
        var cmd = [0x24,bikeNo,0];
        cmd.push( age );
        cmd.push( gender );    
        cmd.push( length );  
        cmd.push( weight  ); // adding weight of bike    
        cmd.push(0); // body fat
        cmd.push(0); // coaching: fitness
        cmd.push(3); // coaching: training freq
        cmd.push(Math.round(maxPower/5)); // power Limit
        cmd.push(0); // hrm Limit
        cmd.push(0); // time Limit
        cmd.push(0); // dist Limit
        cmd.push(0); // calc Limit

        const data = await this.sendCommand(`setPerson(${bikeNo},${age},${gender},${length},${weight})`,cmd,16)

        // In some cases, there was a communication glitch and setPerson was setting limits (based on wrong values)
        // To avoid this to happen, we need to explicitly verify that the response matches the request
        cmd.forEach( (v,i) => { 
            if (data[i]!==v) {
                
                // avoid to reject if maxPower was set to 400 on DaumFitness devices
                if (i===10 && v>=160 ) { // maxPower
                    if (data[i]===0 || data[i]===80) // 400/5 
                        return; 
                }
                throw new Error('illegal response')                    
            }
        } )

        return ({bike:data[1],age,gender,length,weight}) 
    }


    async runData(bikeNo:number=0):Promise<IncyclistBikeData> {       
        const data = await this.sendCommand(`runData(${bikeNo})`,[0x40,bikeNo],19);
        return parseRunData(data)
    }

    async setGear(gear:number,bikeNo=0):Promise<SetGearRepsonse> {       
        const gearVal = between(gear,1,28) 
        const data = await this.sendCommand(`setGear(${bikeNo},${gearVal})`,[0x53,bikeNo,gearVal],3)
        return ({bike : data[1], gear:data[2]})
    }

    async setPower(power:number,bikeNo=0):Promise<SetPowerRepsonse> {
        const powerVal = Math.round( between(power,25,800) /5);
        const data = await this.sendCommand(`setPower(${bikeNo},${power})`,[0x51,bikeNo,powerVal],3)
        return ({bike:data[1],power:data[2]*5});
    }

    async setSlope(slope:number,bikeNo=0):Promise<SetSlopeRepsonse> {
        const cmd = buildSetSlopeCommand(bikeNo,slope)       
        const data = await this.sendCommand(`setSlope(${bikeNo},${slope})`,cmd,6)
        return ({bike:data[1],slope})
    }

 }
