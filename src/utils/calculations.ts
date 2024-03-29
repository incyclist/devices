
const g = 9.80665;
const rho = 1.2041;  		        // air densite at 20°C at sea level

// cWA per bike type for an average rider ( h=1,80m, w=75kg)
const cwABike = {
    race: 0.35,
    triathlon:0.29,
    mountain: 0.57
}
//const k = 0.01090;					// http://www.radpanther.de/index.php?id=85  -- Shimano Ultegra WH6700 (4)
const cRR = 0.0036;					// http://www.radpanther.de/index.php?id=85  -- Conti GP 4000 RS
	

// var adipos = Math.sqrt(mRider/(hRider*750))
// var CwaBike = afCdBike[bikeI] * (afCATireV[bikeI] * ATireV + afCATireH[bikeI] * ATireH + afAFrame[bikeI]);
// var CwaRider = (1 + cadence * .002) * afCd[bikeI] * adipos * ((hRider - adipos) * afSin[bikeI] + adipos);
// var Cwa = CwaBike + CwaRider;

/* 
var asBike     = new Array( 'roadster', 'mtb', 'tandem', 'racetops', 'racedrops', 'tria', 'superman', 'lwbuss', 'swbuss', 'swbass', 'ko4', 'ko4tailbox', 'whitehawk', 'questclosed', 'handtrike' );
var afCdBike   = new Array( 2.0,        1.5,   1.7,      1.5,        1.5,         1.25,   .90,        1.7,      1.6,      1.25 ,    1.2,   1.15,         .036,        .090,          1.5 );
var afCATireV  = new Array( 1.1,        1.1,   1.1,      1.1,        1.1,         1.1,    .9,         .66,      .8,       .85,      .77,   .77,          .1,          .26,           .9 );
var AtireV = 0.021 (race/tria) / 0.05 (mtb)
var afCATireH  = new Array( .9,         .9,    .9,       .9,         .9,          .7,     .7,         .9,       .80,      .84,      .49,   .3,           .13,         .16,           2 );
var afAFrame   = new Array( .06,        .052,  .06,      .048,       .048,        .048,   .044,       .039,     .036,     .031,     .023,  .026,         1,           1,             .046 );
var AtireH = 0.021 (race/tria) / 0.05 (mtb)
var afCd       = new Array( .95,        .79,   .35,      .82,        .60,         .53,    .47,        .85,      .67,      .60,      .50,   .41,          0,           0,             .62 );
var afSin      = new Array( .95,        .85,   .7,       .89,        .67,         .64,    .55,        .64,      .51,      .44,      .37,   .37,          0,           0,             .55 );
*/



export class IllegalArgumentException extends Error {
    constructor(message) {
        super(message);
        this.name = "IllegalArgumentException";
    }
}

export default class C {
    
	/*
	 * P = (m*g*v*(sl/100+cr)+cl/2*v^3)  * 1/(1-c) 
	 * 
	 * => P = a*v + b*v^3
	 * 
	 */

	static calculateSpeed (m:number, power:number, slope:number, props={} as any) {
        if (m===undefined || m===null || m<0)
            throw new IllegalArgumentException("m must be a positive number");

        if (power===undefined || power===null || power<0)
            throw new IllegalArgumentException("power must be a positive number");

        const _rho = props.rho || rho;
        const _cRR = props.cRR || cRR;
        const _cwA = props.cwA || cwABike[props.bikeType||'race'] || cwABike.race

		let sl = Math.atan(slope/100);
		let c1 = 0.5*_rho*_cwA//+2 *k;
		let c2 = (sl +_cRR)*m*g;
		
		let p = c2/c1;
		let q = -1.0*power/c1;
		
		var v = solveCubic(p,q).filter( value=>value>=0 );

        if (v.length===1)
            return v[0]*3.6

        // just as a safety-net: if there are more than 3 possible results, use the one that is closest to the previous speed
        // I could not find any example, where this would be needed, so I could not write a test for this
        // istanbul ignore next 
		if (v.length>1) {
            if (props.previous) {
                let speed = undefined
                let minDiff = undefined
                v.forEach(s => {
                    if (!minDiff) {
                        minDiff = Math.abs(s-props.previous)
                        speed = s
                        return
                    }
                    const diff = Math.abs(s-props.previous)
                    if (diff<minDiff) {
                        minDiff = diff
                        speed = s
                    }

                })
                return speed*3.6

            }
			for (var i=0;i<v.length;i++)
				if (v[i]>0) return v[i]*3.6;
		}
        // istanbul ignore next
		return 0;
	}

    static calculatePower (m:number,  v:number,  slope:number, props={} as any) {
        if (m===undefined || m===null || m<0)
            throw new IllegalArgumentException("m must be a positive number");

        if (v===undefined || v===null || v<0)
            throw new IllegalArgumentException("v must be a positive number");

        let _rho = props.rho || rho;
        let _cRR = props.cRR || cRR;
        let _cwA = props.cwA || cwABike[props.bikeType||'race']

		/** 
		 * P = 1/2*rho*cWA*v^3 +2*k v^3 + m*g*sl*v + cRR*m*g*v 
		 */
		let sl = Math.sin(Math.atan(slope/100));
		let P = (0.5*_rho*_cwA/*+2*k*/)*Math.pow(v,3.0)+(sl +_cRR)*m*g*v; 
		
		return P;
    }	

   
	static  calculateSpeedDaum( gear:number, rpm:number,  bikeType?:string|number) 
	{
        if (bikeType===0 || bikeType===undefined || bikeType==="race" || bikeType==='triathlon') { // Rennrad
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

	static  calculateSpeedBike( gear:number, rpm:number,  chain: number[], cassette: number[], props?:{numGears?:number, wheelCirc?:number} ) 
	{
        if ( chain.length!==2 || cassette.length!==2)
            throw new IllegalArgumentException("chain and cassette must be an array of 2 numbers");
        if ( cassette[0]<1 || cassette[1]<1)
            throw new IllegalArgumentException("cassette must be an array of 2 positive numbers");

        const bikeProps = props || {};
        const minGearRatio =chain[0]/cassette[1]
        const maxGearRatio =chain[1]/cassette[0]
        const numGears = bikeProps.numGears || 28;
        const wheelCirc = bikeProps.wheelCirc || 2125;
        const gearRatio = minGearRatio + (maxGearRatio-minGearRatio)*(gear-1)/(numGears-1);

        
        let	distRotation = wheelCirc*gearRatio/1000;  // distance per rotation [m]
        let speed = rpm*distRotation*60/1000;         // speed [km/h]
        return speed;			
	}
    
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

    

// https://en.wikipedia.org/wiki/Cubic_equation#Cardano's_formula
// x^{3}+px+q=0
export function solveCubic(p , q ) {
    let D = Math.pow(q/2.0,2) + Math.pow(p/3.0, 3);
    
    let R = Math.sign(q)*Math.sqrt(Math.abs(p)/3.0);
    
    if (p===0) {
        return [sqrtN(-1*q,3)];
    }
    
    if (D===0) {
        return  [3*q/p, -3*q/(2*p)];
    }
    
    if (D<0 && p<0) {
        const results = [];
        let phi = Math.acos(q/(2*Math.pow(R, 3)));
        results[0] = -2*R*Math.cos(phi/3);
        results[1] = -2*R*Math.cos(phi/3+2*Math.PI/3);
        results[2] = -2*R*Math.cos(phi/3+4*Math.PI/3);
        return results;
    }

    if (D>0 && p<0) {
        const results = [];
        let phi = acosh(q/(2*Math.pow(R, 3)));
        results[0] = -2*R*Math.cosh(phi/3);
        return results;
    }
    
    // at this point we know that D!=0 and p>0
    
    const results = [];
    let phi = asinh(q/(2*Math.pow(R, 3)));
    results[0] = -2*R*Math.sinh(phi/3);
    return results;
    
}
