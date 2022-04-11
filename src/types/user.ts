/* istanbul ignore file */

export enum Gender { 
    MALE='M', 
    FEMALE='F',
    OTHERS='o'
}
export type User  = {
    weight?: number;
    length?: number;
    age?: number;
    sex?: Gender;

}