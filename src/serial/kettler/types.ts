export interface Command {
    logStr?: string;
    message: string | Buffer;
    timeout?: number;
    onError: (err: Error) => void;
    onResponse: (response: string | Buffer) => void;
}
