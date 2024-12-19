import { DC_ERROR_UNKNOWN_MESSAGE_TYPE, DC_RC_UNEXPECTED_ERROR, DC_RC_UNKNOWN_MESSAGE_TYPE } from "../consts";

export class IllegalMessageError extends Error {
    constructor(public code:number) {
        super('Illegal request: ' + code  );
        this.name = 'IllegalRequestError';
    }
}

export const getResponseCode  = (error:IllegalMessageError):number => { 

    if (error.code === DC_ERROR_UNKNOWN_MESSAGE_TYPE)
        return DC_RC_UNKNOWN_MESSAGE_TYPE

    return DC_RC_UNEXPECTED_ERROR

}
    