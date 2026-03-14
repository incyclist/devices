export type KeyFormat = 'pem' | 'der';
export type KeyType = 'rsa' | 'rsa-pss' | 'dsa' | 'ec' | 'ed25519' | 'ed448' | 'x25519' | 'x448';

export interface KeyEncodingOptions {
    type: 'pkcs1' | 'pkcs8' | 'spki' | 'sec1';
    format: KeyFormat;
}

export interface GenerateKeyPairOptions {
    modulusLength?: number;
    publicExponent?: number;
    namedCurve?: string;
    publicKeyEncoding: KeyEncodingOptions;
    privateKeyEncoding: KeyEncodingOptions;
}

export interface KeyPair {
    publicKey: string | Buffer<ArrayBufferLike>;
    privateKey: string | Buffer<ArrayBufferLike>;
}

export interface IHash {
    update(data: string | Buffer<ArrayBufferLike>): IHash;
    digest(encoding: 'hex' | 'base64'): string;
    digest(): Buffer<ArrayBufferLike>;
}

export interface IHmac {
    update(data: string | Buffer<ArrayBufferLike>): IHmac;
    digest(encoding: 'hex' | 'base64'): string;
    digest(): Buffer<ArrayBufferLike>;
}

export interface ICipher {
    update(data: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike>;
    final(): Buffer<ArrayBufferLike>;
    setAutoPadding(autoPadding?: boolean): ICipher;
}

export interface IDecipher {
    update(data: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike>;
    final(): Buffer<ArrayBufferLike>;
    setAutoPadding(autoPadding?: boolean): IDecipher;
}

export interface ICryptoBinding {
    randomBytes(size: number): Buffer<ArrayBufferLike>;
    createHash(algorithm: string): IHash;
    createHmac(algorithm: string, key: string | Buffer<ArrayBufferLike>): IHmac;
    createCipheriv(algorithm: string, key: Buffer<ArrayBufferLike>, iv: Buffer<ArrayBufferLike>): ICipher;
    createDecipheriv(algorithm: string, key: Buffer<ArrayBufferLike>, iv: Buffer<ArrayBufferLike>): IDecipher;
    generateKeyPairSync(type: KeyType, options: GenerateKeyPairOptions): KeyPair;
}
