/* istanbul ignore file */

export type Point = {
    lat?: number;
    lng?: number;
    elevation?: number;
    distance: number;
    slope?: number;
}

export type Route = {
    programId: number;
    points: Point[];
    type: string;
    name?: string;
    description?: string;
    lapMode: boolean;
    totalDistance: number;
    minElevation?: number;
    maxElevation?: number;
    sampleRate?: number;
}