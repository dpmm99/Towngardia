import { City } from "./City.js";

export class Budget {
    public lastRevenue: Record<string, number> = { "income": 0, "sales": 0, "property": 0 }; //So we can track recent income numbers for display in the UI.
    public lastServiceCosts: Record<string, number> = Object.fromEntries(["fireprotection", "policeprotection", "healthcare", "education", "environment", "infrastructure", "power", "water", "waterimport"].map(id => [id, 0]));
    public otherExpenses: Record<string, number> = { "powerprod": 0, "agriculture": 0, "industry": 0, "resources": 0 }; //Others without an icon (for now)
    constructor(
        public totalIncome: number = 0,
        public totalExpenses: number = 0,
        public taxRates: Record<string, number> = { income: 0.1, sales: 0.1, property: 0.1 },
        public serviceAllocations: Record<string, number> = Object.fromEntries(["fireprotection", "policeprotection", "healthcare", "education", "environment", "infrastructure"].map(id => [id, 1])),
        public powerImportLimit: number = 0.5,
        public waterImportLimit: number = 1.0,
        //TODO: Environment slider only affects Carbon Capture Plant and Weather Control Machine; could be more useful. Trash services?
    ) { }

    calculateBalance(): number {
        return this.totalIncome - this.totalExpenses;
    }

    resetLastServiceCosts() {
        Object.keys(this.lastServiceCosts).forEach(key => this.lastServiceCosts[key] = 0);
    }

    applyBudgetEffects(city: City): void {
        // This method would apply the budget changes to the city
        // For example, updating city properties based on service allocations
        // and calculating new income based on tax rates
    }
}
