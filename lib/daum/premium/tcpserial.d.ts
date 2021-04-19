export default class TcpSocketPort {
    callbacks: any;
    enabled: boolean;
    host: string;
    port: number;
    net: any;
    props: any;
    socket: any;
    isOpen: boolean;
    isClosed: boolean;
    path: string;
    outputQueue: Array<any>;
    iv: any;
    constructor(props: any);
    flush(): void;
    open(): void;
    close(): void;
    onTimeout(): void;
    onConnect(): void;
    onError(err: any): void;
    on(event: any, callback: any): void;
    emit(event: any, ...args: any[]): void;
    write(message: any): void;
    unpipe(): void;
    pipe(transformer: any): any;
    static setResponse(command: any, fn: any): void;
    static getReponseHandler(command: any): any;
    static reset(): void;
}
