
export type Feature = 'VirtualShifting'

export class FeatureToggle {

    protected static _instance:FeatureToggle

    static getInstance():FeatureToggle {
        if (!FeatureToggle._instance)
            FeatureToggle._instance = new FeatureToggle()
        return FeatureToggle._instance
    }
    

    protected enabled: Array<string>
    
    constructor() {        
        this.enabled = []
    }

    add(feature:Feature) {
        this.enabled.push(feature)
    }

    remove(feature:Feature) {
        const index = this.enabled.indexOf(feature)
        if (index > -1)
            this.enabled.splice(index,1)
    }

    has(feature:Feature) {
        return this.enabled.includes(feature)
    }
}

export const useFeatureToggle = () => {
    return FeatureToggle.getInstance()
}   