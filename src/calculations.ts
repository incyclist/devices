
const POS_OBERLENKER = 0;
const POS_BREMSGRIFF = 1;
const POS_UNTERLENKER = 2;
const POS_TRIATHLON = 3;

const g = 9.80665;
const rho = 1.2041;  		        // air densite at 20°C at sea level
const cWAs = [0.45,0.35,0.30,0.25];	// oberlenker, bremsgriff,unterlenker, triathlon
const k = 0.01090;					// http://www.radpanther.de/index.php?id=85  -- Shimano Ultegra WH6700 (4)
const cRR = 0.0036;					// http://www.radpanther.de/index.php?id=85  -- Conti GP 4000 RS
	
var _speedCache = {}

export class IllegalArgumentException extends Error {
    constructor(message) {
        super(message);
        this.name = "IllegalArgumentException";
    }
}

export default class Calculations {
    
	/*
	 * P = (m*g*v*(sl/100+cr)+cl/2*v^3)  * 1/(1-c) 
	 * 
	 * => P = a*v + b*v^3
	 * 
	 */

	static calculateSpeed (m, power, slope, props={} as any) {
                
        var speed=undefined;
        let key = `${Math.round(m*10)} ${Math.round(power)} ${Math.round(slope*10)} ${JSON.stringify(props)}`;
	    speed = _speedCache[key];
		if (speed!==undefined) 
            return speed;
            
		speed = this.calculateSpeedUncached(m,power,slope,props);
		_speedCache[key] = speed;
		return speed;
		
    }

	static calculateSpeedUncached (m:number, power:number, slope:number, props={} as any) {
        if (m===undefined || m===null || m<0)
            throw new IllegalArgumentException("m must be a positive number");

        if (power===undefined || power===null || power<0)
            throw new IllegalArgumentException("power must be a positive number");

        if (slope===undefined || slope===null )
            slope = 0;

        const _rho = props.rho || rho;
        const _cRR = props.cRR || cRR;
        const _cwA = props.cwA || cwA(slope);

		let sl = Math.atan(slope/100);
		let c1 = 0.5*_rho*_cwA+2*k;
		let c2 = (sl +_cRR)*m*g;
		
		let p = c2/c1;
		let q = -1.0*power/c1;
		
		var z = solveCubic(p,q);
		if (z.length>0) {
			for (var i=0;i<z.length;i++)
				if (z[i]>0) return z[i]*3.6;
		}
		return 0;
	}

    static calculatePower (m:number,  v:number,  slope:number, props={} as any) {
        if (m===undefined || m===null || m<0)
            throw new IllegalArgumentException("m must be a positive number");

        if (v===undefined || v===null || v<0)
            throw new IllegalArgumentException("v must be a positive number");

        if (slope===undefined || slope===null )
            slope = 0;

        let _rho = props.rho || rho;
        let _cRR = props.cRR || cRR;
        let _cwA = props.cwA || cwA(slope);

		/**
		 * P = 1/2*rho*cWA*v^3 +2*k v^3 + m*g*sl*v + cRR*m*g*v 
		 */
		let sl = Math.sin(Math.atan(slope/100));
		let P = (0.5*_rho*_cwA+2*k)*Math.pow(v,3.0)+(sl +_cRR)*m*g*v; 
		
		return P;
    }	

   
	static  calculateSpeedDaum( gear, rpm,  bikeType) 
	{
        if (bikeType===0 || bikeType===undefined || bikeType==="race") { // Rennrad
            let lengthRPM=210;
			let gearRatio = 1.75 + (gear-1 )* 0.098767;
			let	distRotation = lengthRPM*gearRatio;
			let speed = rpm*distRotation*0.0006;
			return speed;			
		}
        else {	// Mountainbike
            let lengthRPM=185;            
            let gearRatio = 0.67 + (gear-1 )* 0.1485	;
            let	distRotation = lengthRPM*gearRatio;
            let speed = rpm*distRotation*0.0006;
            return speed;			
		}		
	}

    
}

 function cwA(slope) {
    let cw = cWAs[POS_TRIATHLON];	

    /* 
     * cWA is basically based on Triathlon position, 
     * but downhill we assume that we wil tend towards "Bremsgriff" position, thus betwwen -1 and -5 we will smoothly adjust the cWa from Triathlon to Bremsgriff
     */
    if (slope<=-5) 
        cw = cWAs[POS_BREMSGRIFF];
    else if (slope>-5 && slope<-1) {
        let pct = (slope+5)/4;
        cw = cWAs[POS_TRIATHLON]+pct*(cWAs[POS_BREMSGRIFF]-cWAs[POS_TRIATHLON]);
    }			
    return cw;
}


/*
    * z^3 + p*z + q = 0
    * 
    * D = (q/2)^2 + (p/2)^3
    * 
    */

function acosh( x)
{
    return Math.log(x + Math.sqrt(x*x - 1.0));
}

function asinh( x)
{
    return Math.log(x + Math.sqrt(x*x + 1.0));
}

function sqrtN(x, n) {
    let exp = 1.0/n;
    if ( Math.sign(x)===1 || n%2===0 ) {
        return Math.pow(x,exp);
    }
    return Math.sign(x)*Math.pow(Math.abs(x),exp);
}

function solveCubic(p , q ) {
    let D = Math.pow(q/2.0,2) + Math.pow(p/3.0, 3);
    let R = Math.sign(q)*Math.sqrt(Math.abs(p)/3.0);
    
    if (p===0) {
        return [sqrtN(q,3)];
    }
    
    if (D===0) {
        return  [3*q/p, -3*q/(2*p)];
    }
    
    if (D<0 && p<0) {
        var results = [];
        let phi = Math.acos(q/(2*Math.pow(R, 3)));
        results[0] = -2*R*Math.cos(phi/3);
        results[1] = -2*R*Math.cos(phi/3+2*Math.PI/3);
        results[2] = -2*R*Math.cos(phi/3+4*Math.PI/3);
        return results;
    }

    if (D>0 && p<0) {
        let results = [];
        let phi = acosh(q/(2*Math.pow(R, 3)));
        results[0] = -2*R*Math.cosh(phi/3);
        return results;
    }
    
    if (p>0) {
        let results = [];
        let phi = asinh(q/(2*Math.pow(R, 3)));
        results[0] = -2*R*Math.sinh(phi/3);
        return results;
    }
    return [];
}


/*  

=============================================
TESTS
=============================================

TODO: move tests into mocka test

results = solveCubic(-7, -6);
if (results.length>0) {
    var str = "";
    for ( i in results) {
        if (i>0)
            str+=","
        str += parseFloat(results[i]).toPrecision(2);
    } 
    console.log( str);
}
else
    console.log("no results");

results = solveCubic(6, -20);
if (results.length>0) {
    var str = "";
    for ( i in results) {
        if (i>0)
            str+=","
        str += parseFloat(results[i]).toPrecision(2);
    } 
    console.log( str);
}
else
    console.log("no results");

results = solveCubic(-6, 4);
if (results.length>0) {
    var str = "";
    for ( i in results) {
        if (i>0)
            str+=","
        str += parseFloat(results[i]).toPrecision(2);
    } 
    console.log( str);
}
else
    console.log("no results");


var ts = Date.now();
for (var i=0;i<1000000;i++) {
    Calculations.calculateSpeed ( 70, 100, 0 );
}
var tsE = Date.now();
console.log("Speed Cached:"+(Date.now()-ts))

var ts = Date.now();
for (var i=0;i<1000000;i++) {
    Calculations.calculateSpeedUncached ( 70, 100, 0 );
}
console.log("Speed UnCached:"+(Date.now()-ts))

var ts = Date.now();
for (var i=0;i<1000000;i++) {
    Calculations.calculatePower ( 70, 30/3,6, 0 );
}
console.log("Power:"+(Date.now()-ts))

console.log("33km/h -3.0: "+Calculations.calculatePower ( 70, 33/3.6, -3.0 ))

console.log(Calculations.calculateSpeed ( 70, 100, 0 ));
console.log(Calculations.calculateSpeed ( 70, 100, 0 ));
console.log(Calculations.calculateSpeedUncachedOld ( 70, 100, 0 ));
console.log(Calculations.calculateSpeedDaum ( 10, 100 ));

let v = Calculations.calculateSpeed ( 70, Calculations.calculatePower ( 70,30/3.6,0), 0 );
console.log(v==30 ? true : "false:"+v);


console.log(_speedCache);

//-0.5,90: P=330: Pr=373, v=45.264689999999995

*/
/*
let v= 35.525/3.6;

for (var i=0; i<90; i++)
    //console.log( i+":"+Calculations.calculatePower ( i,v,0.2));

s = Calculations.calculateSpeed(85,100,0);
P = Calculations.calculatePower(85,0,0);
console.log ( Calculations.calculateSpeed(85,100,0));
console.log (P),
console.log(Calculations.calculatePowerAccelarationFromTwoPoints( 82,0,s/3.6,1) )


for ( var i=0;i<100;i++) {
    let slope = (50-i)/10;
    let sl1 = Math.atan(slope/100) ;
    let sl2 = Math.sin( Math.atan(slope/100) );
    console.log( slope+":"+"atan:"+sl1+",sin(atan):"+sl2)
}

P = Calculations.calculatePower(85,1.084,0);
console.log (P);
*/

/*
let P =100;
let m = 85;
let v = 0;
let Pres = 0;
var speed = 0;

for ( var i=0;i<10;i++) {
    console.log( i+": v="+v*3.6+",speed="+speed+",Pres="+Pres);
    speed =  Calculations.calculateAccelSpeed(m,100,0,speed,1)

    Pres = Calculations.calculatePower(m,v,0);
    P = 100-Pres;
    if (P>0) {
        a = Math.sqrt(P/m);
        v = v+a;    
    }
    else {
        P = P*-1;
        a = Math.sqrt(P/m);
        v = v-a;    
    }
    console.log( i+": v="+v*3.6+",speed="+speed+",Pres="+Pres);
}

vc = Calculations.calculateSpeed(m,100,0);
pc = Calculations.calculatePower(m,vc/3.6,0);
console.log( vc);
console.log( pc);

*/
