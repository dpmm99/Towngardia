import { Tech } from "./Tech";

export interface FriendResearchVisitResult {
    /**
     * The tech that was selected to grant research points for, or null if none was.
     */
    tech: Tech | null;
    /**
     * How many long ticks you have to wait to claim any more research bonuses today, 0 if you don't have to wait.
     */
    longTicksToWait: number;
    /**
     * Whether you already claimed a bonus from this friend today.
     */
    alreadyClaimedForThisFriend: boolean;
    /**
     * The number of visits remaining for the day.
     */
    remainingVisits: number;
    /**
     * The number of research points granted, if any.
     */
    points: number;
}
