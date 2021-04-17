export const getBrand = (manId) => {
    if(manId===undefined)
        return "ANT+"

    switch (manId) {
        case 1: return "Garmin"; 
        case 16: return "Timex"; 
        case 23: return "Suunto";        
        case 52: return "Seiko";
        case 53: return "Seiko";
        case 70: return "Sigma";
        case 123: return "Polar"; 
        case 287: return "VDO"; 
        case 32: return "Wahoo"; 
        case 86: return "Elite"; 
        case 89: return "Tacx"; 
        default: 
            return "ANT+"
    }
}

