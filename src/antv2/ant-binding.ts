import {IAntDevice, IChannel} from 'incyclist-ant-plus'
import { AntInterfaceProps } from './ant-interface';

export default class AntDeviceBinding implements IAntDevice{
    constructor( props:AntInterfaceProps ) {}
    open(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    close(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    getMaxChannels(): number {
        throw new Error('Method not implemented.');
    }
    getChannel(): IChannel {
        throw new Error('Method not implemented.');
    }
    freeChannel(channel: IChannel) {
        throw new Error('Method not implemented.');
    }
    getDeviceNumber(): number {
        throw new Error('Method not implemented.');
    }
    write(data: Buffer): void {
        throw new Error('Method not implemented.');
    }
}