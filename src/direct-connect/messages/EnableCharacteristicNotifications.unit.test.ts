import { EnableCharacteristicNotificationsMessage } from "./EnableCharacteristicNotifications"

const M = (str)=>Buffer.from(str,'hex')

describe ('EnableCharacteristicNotification', () => {

    describe('parseResponse',()=>{

        test('confirmed',()=>{
            const m = new EnableCharacteristicNotificationsMessage()
            const res = m.parseResponse(M('01050200001100002a3700001000800000805f9b34fb'))
            expect(res.body).toEqual({characteristicUUID: '00002a3700001000800000805f9b34fb'})
    
        })

    })
})