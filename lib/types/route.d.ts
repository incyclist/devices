export declare type Point = {
    lat?: number;
    lng?: number;
    elevation?: number;
    distance: number;
    slope?: number;
};
export declare enum RouteType {
    FREE_RIDE = "free ride",
    FOLLOW_ROUTE = "follow route",
    VIDEO = "video"
}
export declare type Route = {
    programId: number;
    points: Point[];
    type: string;
    name?: string;
    description?: string;
    lapMode: boolean;
    totalDistance: number;
};
