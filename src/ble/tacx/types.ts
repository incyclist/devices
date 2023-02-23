import { IndoorBikeData } from "../fm";

export interface BleFeBikeData extends IndoorBikeData  {
	EquipmentType?: 'Treadmill' | 'Elliptical' | 'StationaryBike' | 'Rower' | 'Climber' | 'NordicSkier' | 'Trainer' | 'General';
	RealSpeed?: number;
	VirtualSpeed?: number;
	HeartRateSource?: 'HandContact' | 'EM' | 'ANT+';
	State?: 'OFF' | 'READY' | 'IN_USE' | 'FINISHED';

	EventCount?: number;
	AccumulatedPower?: number;
	TrainerStatus?: number;
	TargetStatus?: 'OnTarget' | 'LowSpeed' | 'HighSpeed';

    HwVersion?: number;
	ManId?: number;
	ModelNum?: number;

	SwVersion?: number;
	SerialNumber?: number;
}



export type MessageInfo = {
    message: string,
    ts: number,
    uuid: string
}

export type MessageLog = {
    [uuid:string]: MessageInfo;
}

