
export interface Feature {
}

export interface CharacteristicParser<T> {
    parse(buffer: Buffer, features?: Feature): T
    reset():void
}