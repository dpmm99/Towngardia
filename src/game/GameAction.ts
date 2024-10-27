export enum GameActionType {
    BUILD,
    REMOVE,
    DEMOLISH,
    MOVE,
    ADJUST_BUDGET,
    VISIT_PLAYER,
    START_MINIGAME,
    END_MINIGAME,
    COLLECT_RESOURCES,
    PROVISION_RESOURCES,
    RESEARCH,
    REPAIR,
    ADJUST_TRADES,
    REOPEN_BUSINESS,
    CHANGE_OUTPUT_TYPE,
    ADVANCE_TUTORIAL,
}

export interface GameAction {
    type: GameActionType;
    payload: any; // This could be more specific based on the action type
}
