export declare const sleep: (ms: any) => Promise<unknown>;
export declare function runWithRetries(fn: any, maxRetries: any, timeBetween: any): Promise<unknown>;
export declare function hexstr(arr: any, start?: any, len?: any): string;
export declare class Queue<T> {
    data: Array<T>;
    constructor(values?: Array<T>);
    size(): number;
    clear(): void;
    isEmpty(): boolean;
    dequeue(): T;
    enqueue(value: T): void;
}
