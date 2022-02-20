import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, Settings, UpdateRequest,CyclingModeBase } from "../CyclingMode";
import DaumAdapter from "./DaumAdapter";
import calc from '../calculations'

const SEC_DELAY = 3;


const config = {
    name: "SmartTrainer",
    description: "Calculates power based on speed and slope.",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
        {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of raining', type: CyclingModeProperyType.Integer, default: 50},
        {key:'minPower',name: 'Minimum Power', description: 'Minimum power in declines', type: CyclingModeProperyType.Integer, default: 50},
        {key:'simulation',name: 'Simulate ', description: 'Simulate ', type: CyclingModeProperyType.Boolean, default: false},
        {key:'chainRings',name: 'Chain Rings', description: 'Simulated chain rings (format: <min>-<max>)', type: CyclingModeProperyType.String, validation:'', default:'36-52', condition:(s)=>s.simulation},
        {key:'cassetteRings',name: 'Cassette', description: 'Simulated cassette (format: <min>-<max>)', type: CyclingModeProperyType.String, validation:'', default:'11-30', condition:(s)=>s.simulation},
    ]
}

interface STUpdateRequest extends UpdateRequest {
    calculatedPower?: number;
    delta?: number;
    enforced?: boolean;
    belowMin?: boolean;
    aboveMax?: boolean;    
}

export enum direction {
    up = 'up',
    down = 'down'
}


interface STEvent {
    gearUpdate?: direction;
    rpmUpdate?: boolean;
    targetNotReached?: number;
}

export default class SmartTrainerCyclingMode extends CyclingModeBase implements CyclingMode {

    logger: EventLogger;
    data: IncyclistBikeData;
    prevRequest: STUpdateRequest;
    prevUpdateTS: number = 0;
    chain: number[];
    cassette: number[];
    event: STEvent = {}


    constructor(adapter: DaumAdapter, props?: Settings) {
        super(adapter,props);
        this.logger = adapter ? adapter.logger : undefined;
        if (!this.logger) this.logger = new EventLogger('SmartTrainer')      
    }

    getName(): string {
        return config.name;
    }
    getDescription(): string {
        return config.description;
    }
    getProperties(): CyclingModeProperty[] {
        return config.properties;
    }
    getProperty(name: string): CyclingModeProperty {
        return config.properties.find(p => p.name===name);
    }

    getBikeInitRequest(): STUpdateRequest {
        const startPower = this.getSetting('startPower');
        return { targetPower: startPower};
    }    

    useGearSimulation() {
        const simulation = this.getSetting('simulation');
        if (simulation===false) return false;

        const chain = this.getSetting('chainRings');
        const cassette = this.getSetting('cassetteRings');
        return  (chain && this.getMinMaxGears('chain')!==undefined && cassette && this.getMinMaxGears('cassette')!==undefined)
    }

    getMinMaxGears(source: string): [number, number] {
        const minMaxStr = this.getSetting(`${source}Rings`);
        const values = minMaxStr.split('-');
        if (values[0] && values[1] && values[0]<values[1]) {
            return [parseInt(values[0]), parseInt(values[1])];
        }
        if (values[0] && values[1] && values[0]>values[1]) {
            return [parseInt(values[1]), parseInt(values[0])];
        }
        return;
    }




    sendBikeUpdate(request: STUpdateRequest): STUpdateRequest {

        // log request and context
        const getData= ()=>{
            if (!this.data) return {}
            const {gear,pedalRpm,slope, power,speed} = this.data;
            return {gear,pedalRpm,slope, power,speed} 
        }
        
        const event = {...this.event} as any;
        if (this.data===undefined) event.noData = true;
        const slope = request.slope===undefined? request.slope : parseFloat(request.slope.toFixed(1));
        if (slope!==undefined && (event.noData || Math.abs(slope-this.data.slope)>=0.1 )) event.slopeUpdate = true;
        if (this.prevRequest===undefined) event.initialCall = true;
        this.logger.logEvent( {message:"processing update request",request,prev:this.prevRequest,data:getData(),event} );

        const minPower = this.getSetting('minPower');
        let newRequest:STUpdateRequest = {};

        try {

            let targetEnforced = false;
            const updateRequestFromCalculated = calculatedRequest => {
                newRequest.calculatedPower = calculatedRequest.calculatedPower;
                newRequest.delta = calculatedRequest.delta;
                if (!calculatedRequest.belowMin || calculatedRequest.targetPower!==minPower) 
                    this.event.targetNotReached = 1;                                                
                else 
                    newRequest.belowMin = true;
            }
            const enforceCalculated = calculatedRequest => {
                // overwrite target not reached event
                delete this.event.targetNotReached;
                delete newRequest.calculatedPower
                delete newRequest.delta;
                newRequest.targetPower = calculatedRequest.calculatedPower;
                targetEnforced = true;
            }


            if ( !request || request.reset || Object.keys(request).length===0 ) {
                this.prevRequest = {};
                return {};
            }
            
   
            if ( request.refresh && !event.initialCall && !event.gearUpdate && !event.rpmUpdate && !event.targetNotReached) {              
                    request = JSON.parse(JSON.stringify(this.prevRequest));
                    delete request.refresh;

                    this.logger.log('returning previous request')
                    return request;
            } 
            else if (request.refresh && event.targetNotReached  && !event.slopeUpdate && !event.gearUpdate) {

                const {delta,calculatedPower} = this.prevRequest;
                const prevPower = calculatedPower-delta

                if ( delta===undefined || prevPower===undefined || calculatedPower===undefined )  {
                    delete this.event.targetNotReached;
                    return request;
                }
                
                const retryCnt = ++this.event.targetNotReached;
                        
                newRequest.targetPower = prevPower + delta*retryCnt/SEC_DELAY;
                if ( retryCnt<SEC_DELAY)  {
                    newRequest.delta = delta;
                    newRequest.calculatedPower = calculatedPower;                    
                }
                else {
                    delete this.event.targetNotReached;
                }
                delete request.refresh;

                if (newRequest.targetPower<=minPower) {
                    newRequest.belowMin = true;
                }

                this.prevRequest = JSON.parse(JSON.stringify(newRequest));
                return newRequest;
    
                
            }
            
            
            if (request.targetPower!==undefined) {
                newRequest.targetPower = request.targetPower;
                newRequest.enforced = true;
                this.event = {}
                
            }
        
            else if (request.maxPower!==undefined && request.minPower!==undefined && request.maxPower===request.minPower) {
                newRequest.targetPower = request.maxPower;      
                newRequest.enforced = true;          
                this.event = {}
            }
            
        
            else {
                
                let calculatedRequest = this.calculateTargetPower(request);

            
                if (event.gearUpdate && !event.noData) {
                    const {gear,pedalRpm, slope} = this.data;


                    
                    const speed = this.calculateSpeed(gear,pedalRpm,slope,this.data.speed)
                    calculatedRequest = this.calculateTargetPower(request,speed);
                    newRequest.targetPower = calculatedRequest.targetPower;
                    if (calculatedRequest.belowMin) newRequest.belowMin = true;
                 

                    if ( calculatedRequest.calculatedPower && calculatedRequest.targetPower!==calculatedRequest.calculatedPower) {
                        updateRequestFromCalculated(calculatedRequest);                    
                    }
                    else if ( calculatedRequest.calculatedPower && Math.abs(calculatedRequest.targetPower-calculatedRequest.calculatedPower)<0.1 ) {
                        delete this.event.targetNotReached;                   
                    }


                    if ( (event.gearUpdate===direction.up && calculatedRequest.calculatedPower && calculatedRequest.calculatedPower>calculatedRequest.targetPower) 
                    || (event.gearUpdate===direction.down && calculatedRequest.calculatedPower && calculatedRequest.calculatedPower<calculatedRequest.targetPower) ){
                        enforceCalculated(calculatedRequest);
                    }

                }

                if (event.slopeUpdate && !targetEnforced) {
                    newRequest.targetPower = calculatedRequest.targetPower;
                    if ( calculatedRequest.calculatedPower && calculatedRequest.targetPower!==calculatedRequest.calculatedPower) {
                        updateRequestFromCalculated(calculatedRequest);                                     
                    }
                }

        
                if (request.maxPower!==undefined) {
                    if (calculatedRequest.targetPower!==undefined && calculatedRequest.targetPower>request.maxPower) {
                        newRequest.targetPower = request.maxPower;
                        newRequest.aboveMax = true;
                    }
                }
            
                if (request.minPower!==undefined) {
                    if (calculatedRequest.targetPower!==undefined && calculatedRequest.targetPower<request.minPower) {
                        newRequest.targetPower = request.minPower;
                        newRequest.belowMin = true;
                    }
                }          

                if (!event.slopeUpdate && !event.gearUpdate) {
                    newRequest.targetPower = calculatedRequest.targetPower;
                    if ( calculatedRequest.calculatedPower && calculatedRequest.targetPower!==calculatedRequest.calculatedPower) {
                        updateRequestFromCalculated(calculatedRequest);                                     
                    }                    
                }


        
            }

            if (newRequest.targetPower!==undefined) 
                newRequest.targetPower = Math.round(newRequest.targetPower);
            
            this.prevRequest = JSON.parse(JSON.stringify(newRequest));
    
    
        }
        
        catch ( err)  /* istanbul ignore next */ {
            this.logger.logEvent( {message:"error",fn:'sendBikeUpdate()',request,error:err.message||err,stack:err.stack} );

        }
        return newRequest;
        
    }


    updateData(bikeData: IncyclistBikeData) {
        

        const prevData = JSON.parse(JSON.stringify(this.data || {} ))
        const prevSpeed = prevData.speed;        
        const prevRequest = this.prevRequest || {};
        const data = this.data || {} as any;
        const gearSimulation = this.useGearSimulation();
        const fromPower = (prevRequest.belowMin || prevRequest.aboveMax);


        delete this.event.gearUpdate;
        delete this.event.rpmUpdate;
        
        try {

            let rpm = bikeData.pedalRpm || 0;
            let gear = bikeData.gear || 0
            let power = bikeData.power || 0;
            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
            let speed;

            if ( gear!==prevData.gear ) 
                this.event.gearUpdate = gear>prevData.gear ? direction.up : direction.down;
            if ( rpm!==prevData.pedalRpm ) 
                this.event.rpmUpdate = true;



            let m = (this.adapter as DaumAdapter).getWeight();
            let distanceInternal = prevData.distanceInternal || 0;  // meters
            let distance = Math.round(distanceInternal/100);
            let ts = Date.now();
            let duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec

                
            //let speed = calc.calculateSpeedDaum(gear, rpm, bikeType)
            if (rpm===0 || bikeData.isPedalling===false) {
                speed = 0;
                power = 0;
                delete prevRequest.belowMin;               
            }
            else {
                if (prevRequest.enforced ) {
                    speed = calc.calculateSpeed(m,power, slope,{previous:prevSpeed});
                }
                else {
                    speed = this.calculateSpeed(gear,rpm,slope,speed,{fromPower,prevSpeed} ) 

                    // power required to keep speed at given slope
                    /*                    
                    const vPrev = (prevData.speed || 0 )/3.6
                    const EkinPrev = 1/2*m*vPrev*vPrev;
                    
                    


                    let powerRequired = calc.calculatePower(m,vPrev,prevData.slope);
                    const powerDelta = powerRequired - power;

                    
                    const Ekin = EkinPrev-powerDelta*duration;
                    const v = Math.sqrt(2*Ekin/m);
                    speed = v*3.6
                    */
                }                        
                const v = speed /3.6;
                distanceInternal += Math.round(v*duration);                
            }
        
            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = distanceInternal;
            data.distance =  distance
            data.slope = slope;
            data.pedalRpm = rpm;
            data.gear = gear;
            if ( data.time)
                data.time+=duration;
            else data.time =0;
            data.heartrate=bikeData.heartrate;
            data.isPedalling=bikeData.isPedalling;


        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest,prevSpeed,gearSimulation,event:this.event,speedProps:fromPower} );

        this.data = data;
        this.prevUpdateTS = Date.now()

        return data;
        
    }

    calculateSpeed(gear,rpm,slope,bikeSpeed,props:any={} ) {
        const gearSimulation = this.useGearSimulation();
        const prevRequest = this.prevRequest || {};
        const minPower = this.getSetting('minPower');     
        const bikeType = this.getSetting('bikeType').toLowerCase();   
        const m = (this.adapter as DaumAdapter).getWeight();
        let speed = bikeSpeed;

        const Ekin = (m,speed) => {
            const v = speed/3.6;
            return 1/2*m*v*v;
        }

        if ( gearSimulation) {
            if (!this.chain)  this.chain = this.getMinMaxGears('chain')
            if (!this.cassette)  this.cassette = this.getMinMaxGears('cassette')
            speed = calc.calculateSpeedBike(gear, rpm, this.chain, this.cassette, {numGears:28, wheelCirc:2125});
        }
        else {
            speed = calc.calculateSpeedDaum(gear,rpm,bikeType);
        }

        if (props.fromPower) {
            let calculatedPower = calc.calculatePower(m,bikeSpeed/3.6,slope,{bikeType});
            
            if (calculatedPower<=minPower || (prevRequest.minPower&&calculatedPower<prevRequest.minPower)) {
                // calculate speed that you would have if you would constanly cycle with minPower
                const speedTarget = calc.calculateSpeed(m,minPower, slope,{previous:props.prevSpeed});                 

                // calculate speed that we would have after 1s if we would not adjust power
                const EkinBefore = Ekin(m,bikeSpeed);

                const powerDelta = minPower - calculatedPower
                const EkinAfter1s = EkinBefore + powerDelta;
                if (EkinAfter1s>EkinBefore) {
                    const vAfter1s = Math.sqrt(2*EkinAfter1s/m);
                    const speedAfter = vAfter1s*3.6

                    if (speedAfter>speedTarget) 
                        speed = speedTarget;                    
                }
                

            }                                   
            else if (prevRequest.maxPower && calculatedPower >prevRequest.maxPower) 
                speed = calc.calculateSpeed(m,minPower, slope,{previous:props.prevSpeed});                            
        

        }        
        return speed;
    }

    calculateTargetPower(request:STUpdateRequest,speed?:number ):STUpdateRequest {
        
        const defaultPower = this.getSetting('startPower');
        const minPower = this.getSetting('minPower');
        const bikeType = this.getSetting('bikeType').toLowerCase();     

        const m = (this.adapter as DaumAdapter).getWeight();

        const prevData = this.data || {} as any;
        const slope = parseFloat((request.slope===undefined ? prevData.slope||0 : request.slope).toFixed(1));
        let target = request.targetPower || defaultPower;
        
        if ( prevData.speed!==undefined || speed!==undefined) {
            
            const v = speed  ? speed/3.6 : prevData.speed/3.6;
            
            // power required to keep speed at given slope
            const calculatedPower = calc.calculatePower(m,v,slope,{bikeType});
            
            const power =  (calculatedPower<minPower) ? minPower: calculatedPower
            let belowMin = (calculatedPower<minPower);

            // assumption: adjust power will take Xs, i.e. per second, we can adjust 1/X of the delta
            const powerDelta = power - prevData.power||0;
            let target;
            if (Math.abs(powerDelta)>10) {
                target = Math.round(prevData.power + powerDelta/SEC_DELAY);
                if ( target<minPower ) { 
                    target = minPower;
                    belowMin = true;

                }
            }
            else {
                target = power;
            }

            //const speed = calc.calculateSpeedDaum(prevData.gear, prevData.pedalRpm )
            //const speed = this.calculateSpeed(prevData.gear,prevData.pedalRpm,m,slope,prevData.speed ) 
            if (!speed)
                this.logger.logEvent({message:'request:targetPower', info:{prev:prevData.power||0, calculated:calculatedPower, required:power, delta: powerDelta, target, belowMin }})
            request.targetPower = target;
            request.calculatedPower = power;
            request.delta = powerDelta;
            request.belowMin = belowMin;

            
            /*
            console.log('~~~ power', power)

            // calculate speed that we would have after 1s if we would not adjust power
            const Ekin = 1/2*m*v*v;
            const powerDelta = power - prevData.power;
            const EkinAfter1s = Ekin - powerDelta;
            if (EkinAfter1s>=0) {
                const vAfter1s = Math.sqrt(2*EkinAfter1s/m);

                console.log('~~~ Ekin', Ekin, powerDelta,EkinAfter1s, vAfter1s)

                power = calc.calculatePower(m,vAfter1s,prevData.slope);
                if (power<minPower) power = minPower;
                console.log('~~~ powerAdjusted', power)
            }
            

            request.targetPower = power;
            */
        }
        else {
            request.targetPower = target
            request.calculatedPower = target
        }        


              
        return request
    }

}