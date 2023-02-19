import { EventLogger } from "gd-eventlog"
import SerialInterface from "./serial-interface"

export type SerialCommProps = {
    serial: SerialInterface,
    path: string,
    logger?: EventLogger
}