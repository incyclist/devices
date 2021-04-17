export default class TcpSocketPort {
    static setResponse(command: any, fn: any): void;
    static getReponseHandler(command: any): any;
    static reset(): void;
    constructor(props: any);
    callbacks: {};
    isOpen: boolean;
    props: any;
    enabled: any;
    host: any;
    port: any;
    net: any;
    path: string;
    socket: any;
    outputQueue: any[];
    iv: any;
    flush(): void;
    open(): void;
    close(): void;
    isClosed: boolean;
    onTimeout(): void;
    onConnect(): void;
    onError(err: any): void;
    on(event: any, callback: any): void;
    emit(event: any, ...args: any[]): void;
    write(message: any): void;
    unpipe(): void;
    pipe(transformer: any): any;
}
