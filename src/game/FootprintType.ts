export enum FootprintType {
    EMPTY = 1, //Will never overwrite another type of footprint when placing a building, if used in stampFootprint.
    RESIDENCE = 1 << 1, //Can generally build on top of residences. Exception: the spawner can't put houses on top of apartments or other houses.
    OCCUPIED = 1 << 2,
    WATER = 1 << 3,
    MINE = 1 << 4,
    GEO_VENT = 1 << 5,
    OIL_WELL = 1 << 6,
    SAND = 1 << 7,
    FUSION_PLANT = 1 << 8,
    COAL_PLANT = 1 << 9,
    NUCLEAR_PLANT = 1 << 10,
    OIL_PLANT = 1 << 11,
    GEM_MINE = 1 << 12,
    SPECIAL = 1 << 13, //For use with natural resources that need unlocked by demolishing filth on top of them or whatever
    LITHIUM_MINE = 1 << 14,
    COLLEGE = 1 << 15,
    HOT_SPRING = 1 << 16,
    MUST_BE_ON = WATER | MINE | GEO_VENT | OIL_WELL | SAND | FUSION_PLANT | COAL_PLANT | NUCLEAR_PLANT | OIL_PLANT | GEM_MINE | SPECIAL | LITHIUM_MINE | COLLEGE | HOT_SPRING,
    ALL = EMPTY | RESIDENCE | OCCUPIED | WATER | MINE | GEO_VENT | OIL_WELL | SAND | FUSION_PLANT | COAL_PLANT | NUCLEAR_PLANT | OIL_PLANT | GEM_MINE | SPECIAL | LITHIUM_MINE | COLLEGE | HOT_SPRING
}