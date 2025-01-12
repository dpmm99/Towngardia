import { TitleTypes } from "./AchievementTypes.js";
import { Building } from "./Building.js";
import { AlgaeFarm, CarbonCapturePlant, Carnicultivator, Clinic, DataCenter, DepartmentOfEnergy, EnvironmentalLab, Farm, FusionFuelTruck, FusionPowerPlant, GeothermalPowerPlant, Hospital, Nanogigafactory, PoliceUAVHub, QuantumComputingLab, ShowHome, TreeFarm, UrbanCampDome, VerticalFarm, WeatherControlMachine, getBuildingType } from "./BuildingTypes.js";
import { City } from "./City.js";
import { CAPACITY_MULTIPLIER, Lithium } from "./ResourceTypes.js";
import { Tech } from "./Tech.js";

export class HeatPumps extends Tech {
    constructor() {
        super(
            'heatpumps',
            'Heat Pumps',
            'Heat pumps are a more efficient way to heat and cool buildings. They use electricity to move heat from a cool space to a warm space, making the cool space cooler and the warm space warmer.',
            [{ type: 'research', amount: 10 }],
            0.04, 0.03, //3% per long tick and 4% to start, so 8 days of real time to fully adopt
            0, 0, //The very first tech, at the top-left corner. Positions cannot be negative.
            [], //No prereqs, no paths
        );
    }
}

export class Geothermal extends Tech {
    constructor() {
        super(
            'geothermal',
            'Geothermal Power',
            'Building unlock: Geothermal power is a clean, renewable energy source that can be used for electricity generation or heating.',
            [{ type: 'research', amount: 50 }],
            1, 1, //Adoption rate is irrelevant since you have to construct it yourself
            680, 820,
            [{ id: 'heatpumps', path: [] }],
            false, true //Unavailable until you find a geothermal vent, spawned by earthquakes
        );
    }

    override applyEffects(city: City) {
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id); //Checked for each eco-friendly research that comes after Heat Pumps--i.e., the second eco-friendly tech you can research.
        city.unlock(getBuildingType(GeothermalPowerPlant)); //NOTE: If a building of this type already exists, that one won't EVER show the Build Copy button.
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") { //Making room for Lightning Rods
            this.displayX = new HydroponicGardens().displayX;
            this.displayY = 1120;
        }
    }
}

export class VacuumInsulatedWindows extends Tech {
    constructor() {
        super(
            'vacuumwindows',
            'Vacuum Insulated Windows',
            'Windows with a vacuum between panes to dramatically reduce noise and heat transfer, improving building energy efficiency. Also unlocks Urban Camp Dome.',
            [{ type: 'research', amount: 20 }, { type: 'glass', amount: 50 }],
            0.05, 0.02,
            200, 240,
            [{ id: "heatpumps", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id);
        city.unlock(getBuildingType(UrbanCampDome));
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.researched = true;
            this.adoptionRate = 1;
            this.connections = []; //I still want to show it, but I don't want it to connect to anything.
            this.recalculatePrerequisites();
            this.displayY = new GrapheneBatteries().displayY; //Offset it a bit so Wind Turbine Lattice Frame can line up with Lab Grown Meat, Incubators, Genetically Modified Crops, etc.
        }
    }
}

export class RooftopSolar extends Tech {
    constructor() {
        super(
            'rooftopsolar',
            'Rooftop Solar Panels',
            'Small-scale solar installations on building rooftops generate clean electricity for feeding back into the grid. Costs less silicon if you research Perovskite-Blend Solar Cells first.',
            [{ type: 'research', amount: 30 }, { type: 'silicon', amount: 100 }, { type: 'glass', amount: 100 }],
            0.02, 0.018,
            520, 720,
            [{ id: "gridbalancer", path: [] }]
        );
    }

    override applyRegionEffects(region: string) { //Making room for Lightning Rods
        if (region === "volcanic") this.displayY = 920;
    }
}

export class SmartHomeSystems extends Tech {
    constructor() {
        super(
            'smarthome',
            'Smart Home Systems',
            'Integrated systems that optimize energy usage in homes through automated control of heating, cooling, and appliances. Also unlocks Show Home and Department of Energy.',
            [{ type: 'research', amount: 25 }, { type: 'electronics', amount: 50 }, { type: 'plastics', amount: 30 }],
            0.03, 0.015,
            520, 300,
            [{ id: "vacuumwindows", path: [0.5255, 0.155] }, { id: "windlattice", path: [0.5, 0.2] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(ShowHome));
        city.unlock(getBuildingType(DepartmentOfEnergy));
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.connections = this.connections.filter(p => p.id !== "vacuumwindows"); //Remove the Vacuum Windows connection since that's researched by default in the volcanic region
            this.connections[0].path = []; //Now it's a straight shot to Wind Turbine Lattice Frame
            this.recalculatePrerequisites();
        }
    }
}

export class CoalPowerScrubbers extends Tech {
    constructor() {
        super(
            'coalscrubbers',
            'Coal Power Scrubbers',
            'Advanced filtration systems that significantly reduce pollutant emissions from coal power plants. Also unlocks Environmental Lab.',
            [{ type: 'research', amount: 40 }, { type: 'steel', amount: 100 }, { type: 'coal', amount: 20 }],
            0.1, 0.05,
            200, 0,
            [{ id: "heatpumps", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id);
        city.unlock(getBuildingType(EnvironmentalLab));
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.researched = true;
            this.adoptionRate = 1;
        }
    } //Doesn't have to be hidden/swapped out, can just show as completed, because its only prereq is Heat Pumps--very minor if Carbon Capture Systems is researchable earlier because of this.
}

export class PerovskiteSolarCells extends Tech {
    constructor() {
        super(
            'perovskitesolar',
            'Perovskite-Blend Solar Cells',
            'Next-generation solar cells that increase efficiency and reduce reliance on silicon, lowering production and upkeep costs. Also affects Rooftop Solar if not yet researched.',
            [{ type: 'research', amount: 30 }, { type: 'silicon', amount: 40 }],
            0.01, 0.06,
            680, 640,
            [{ id: "windlattice", path: [] }]
        );
    }

    override applyEffects(city: City) {
        const rooftopSolar = city.techManager.techs.get(new RooftopSolar().id);
        if (rooftopSolar) rooftopSolar.adjustCost("silicon", -0.25, true)
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") { //Making room for Lightning Rods
            this.displayX = new HydroponicGardens().displayX;
            this.displayY = new AIDiagnostics().displayY;
        }
    }
}

export class WindTurbineLattice extends Tech {
    constructor() {
        super(
            'windlattice',
            'Wind Turbine Lattice Frame',
            'Advanced structural design that reduces construction material requirements and upkeep costs for wind turbines.',
            [{ type: 'research', amount: 15 }, { type: 'steel', amount: 20 }],
            0.1, 0.06,
            200, 380,
            [{ id: "heatpumps", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id);
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.displayY = new SmartHomeSystems().displayY;
        }
    }
}

export class FusionPower extends Tech {
    constructor() {
        super(
            'fusionpower',
            'Fusion Power',
            'Building unlock: Fusion power plant. Groundbreaking research into controlled nuclear fusion, paving the way for unlimited clean energy.',
            [{ type: 'research', amount: 200 }, { type: 'tritium', amount: 50 }, { type: 'lithium', amount: 20 }, { type: 'concrete', amount: 100 }],
            1, 1,
            900, 740,
            [{ id: "geothermal", path: [] }, { id: "perovskitesolar", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(FusionPowerPlant));
        city.unlock(getBuildingType(FusionFuelTruck));
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") { //Making room for Lightning Rods
            this.displayX = new TelemedicineInfra().displayX;
            this.displayY = 920;
        }
    }
}

export class BreederReactor extends Tech {
    constructor() {
        super(
            'breederreactor',
            'Breeder Reactor',
            'Advanced fusion reactor design that produces most of its own tritium, but it consumes some lithium to do so.',
            [{ type: 'research', amount: 100 }, { type: 'tritium', amount: 20 }, { type: 'lithium', amount: 30 }],
            1, 1,
            1100, 740,
            [{ id: "fusionpower", path: [] }]
        );
    }

    override applyEffects(city: City) {
        //affects all placed, unplaced, and template buildings directly
        for (const building of city.buildings.concat(city.unplacedBuildings).concat(city.buildingTypes).filter(p => p instanceof FusionPowerPlant)) {
            building.inputResources.find(p => p.type === 'tritium')!.consumptionRate *= 0.125;
            building.inputResources.push(new Lithium(0, 0, 0.125, 0.125 * 2 * CAPACITY_MULTIPLIER)); //Twice the usual capacity since power is pretty important
        }
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") { //Making room for Lightning Rods
            this.displayX = new AIDiagnostics().displayX;
            this.displayY = 920;
        }
    }
}

export class AdvancedRobotics extends Tech {
    constructor() {
        super(
            'advrobots',
            'Advanced Robotics',
            'Cutting-edge robotic systems that significantly increase production speed in factories.',
            [{ type: 'research', amount: 80 }, { type: 'electronics', amount: 100 }],
            0.02, 0.02,
            760, 120,
            [{ id: "smarthome", path: [] }]
        );
    }
}

export class AILogistics extends Tech {
    constructor() {
        super(
            'ailogistics',
            'AI-Driven Logistics',
            'AI systems that optimize warehouse operations, improving storage efficiency for complex goods. Requires a Data Center with >50% efficiency.',
            [{ type: 'research', amount: 70 }, { type: 'electronics', amount: 80 }],
            0.03, 0.03,
            1240, 0,
            [{ id: "advrobots", path: [] }]
        );
    }
    override isUnavailable(city: City): boolean {
        return !city.buildings.some(p => p instanceof DataCenter && p.lastEfficiency > 0.9);
    }

    override applyEffects(city: City) {
        //Affects placed, unplaced, AND template buildings directly.
        for (const building of city.buildings.concat(city.unplacedBuildings).concat(city.buildingTypes).filter(p => p.hasStorage())) {
            building.addStorage(city, 10);
        }
    }
}

export class ThreeDPrinting extends Tech {
    constructor() {
        super(
            '3dprinting',
            '3D Printing Facilities',
            'Advanced manufacturing facilities that use additive processes, reducing plastic waste in production and steel needs in construction.',
            [{ type: 'research', amount: 65 }, { type: 'plastics', amount: 100 }],
            0.04, 0.03,
            1000, 180,
            [{ id: "advrobots", path: [0.5, 0.15] }]
        );
    }
}

export class CarbonCapture extends Tech {
    constructor() {
        super(
            'carboncapture',
            'Carbon Capture Systems',
            'Building unlock: Carbon Capture Plant. Technology that captures and stores carbon dioxide, reducing greenhouse gas emissions.',
            [{ type: 'research', amount: 90 }, { type: 'steel', amount: 150 }],
            1, 1,
            440, 0,
            [{ id: "coalscrubbers", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(CarbonCapturePlant));
    }
}

export class VerticalFarming extends Tech {
    constructor() {
        super(
            'verticalfarm',
            'Vertical Farming',
            'Building unlock: Vertical Farm. Multi-story indoor farming facilities that maximize land use and crop yield in urban environments.',
            [{ type: 'research', amount: 75 }, { type: 'electronics', amount: 100 }],
            1, 1,
            760, 300,
            [{ id: "smarthome", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(VerticalFarm));
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.researched = true;
            this.adoptionRate = 1;
            this.displayY = new LabGrownMeat().displayY;
            this.description = "Building unlock: Vertical Tree Farm. Multi-story indoor tree farming facilities that maximize land use and wood yield in extreme environments.";
        }
    }
}

export class HydroponicGardens extends Tech {
    constructor() {
        super(
            'hydroponics',
            'Hydroponic Gardens',
            'Soil-free growing systems that allow citizens to efficiently grow their own food at home.',
            [{ type: 'research', amount: 55 }, { type: 'plastics', amount: 80 }],
            0.04, 0.01, //Nearly a month to adopt
            1000, 300,
            [{ id: "verticalfarm", path: [] }]
        );
    }

    override applyRegionEffects(region: string) {//TODO: Anything that references this must have a applyRegionEffects method to switch its paths
        if (region === "volcanic") {
            this.researched = true;
            this.adoptionRate = 1;
            this.displayY = new Incubators().displayY;
        }
    }
}

export class LabGrownMeat extends Tech {
    constructor() {
        super(
            'labmeat',
            'Lab-Grown Meat',
            'Building unlock: Cultured meat produced in laboratories, reducing the environmental impact of traditional livestock farming.',
            [{ type: 'research', amount: 85 }, { type: 'pharmaceuticals', amount: 100 }],
            1, 1,
            760, 460,
            [{ id: "verticalfarm", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(Carnicultivator));
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.displayY = new VerticalFarming().displayY;
            this.connections[0].id = "smarthome";
            this.recalculatePrerequisites();
        }
    }
}

export class Incubators extends Tech {
    constructor() {
        super(
            'incubators',
            'Incubators',
            'Equipment and chemicals to increase ranch, fish farm, and carnicultivator output. Raises power usage and upkeep costs.',
            [{ type: 'research', amount: 70 }, { type: 'steel', amount: 40 }, { type: 'pharmaceuticals', amount: 20 }],
            0.03, 0.03,
            1000, 460,
            [{ id: "labmeat", path: [] }]
        );
    }

    //Production rate and capacity changes are handled in the buildings' onLongTick.

    override applyRegionEffects(region: string) {
        if (region === "volcanic") { //Move up to fill the space where Hydroponic Gardens was
            this.displayY = new HydroponicGardens().displayY;
        }
    }
}

export class GMCrops extends Tech {
    constructor() {
        super(
            'gmcrops',
            'Genetically Modified Crops',
            'Crops engineered for increased yield, pest resistance, and nutrient content.',
            [{ type: 'research', amount: 70 }, { type: 'grain', amount: 150 }],
            0.03, 0.03,
            1520, 300,
            [{ id: "hydroponics", path: [] }]
        );
    }

    //Production rate and capacity changes are handled in the buildings' onLongTick.

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.connections[0].id = "incubators";
            this.recalculatePrerequisites();
        }
    }
}

export class RetainingSoil extends Tech {
    constructor() {
        super(
            'retainingsoil',
            'Retaining Soil',
            'Advanced soil management techniques that improve water retention and reduce the impact of droughts on farms.',
            [{ type: 'research', amount: 60 }, { type: 'sand', amount: 200 }],
            0.05, 0.03,
            1820, 300,
            [{ id: "gmcrops", path: [] }]
        );
    }
}

export class GrapheneBatteries extends Tech {
    constructor() {
        super(
            'graphenebattery',
            'Graphene Batteries',
            'High-capacity, fast-charging batteries that significantly boost electric vehicle adoption. Reduces the lithium requirement for battery manufacturing, too.',
            [{ type: 'research', amount: 95 }, { type: 'electronics', amount: 90 }, { type: 'lithium', amount: 20 }],
            0.05, 0.025, //~10 days to fully adopt
            1520, 140,
            [{ id: "ailogistics", path: [] }]
        );
    }
}

export class AutonomousVehicles extends Tech {
    constructor() {
        super(
            'autonomousvehicles',
            'Autonomous Vehicles',
            'Self-driving vehicles that reduce traffic congestion and improve transportation efficiency. Also unlocks Police UAV Hub.',
            [{ type: 'research', amount: 100 }, { type: 'electronics', amount: 150 }, { type: 'batteries', amount: 30 }],
            0.05, 0.008, //~30 days to fully adopt
            1820, 140,
            [{ id: "graphenebattery", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(PoliceUAVHub));
    }
}

export class ARShopping extends Tech {
    constructor() {
        super(
            'arshopping',
            'AR Shopping Experiences',
            'Augmented reality systems that enhance retail experiences, boosting sales and customer capacity. (Note: reduces value per patron, but increases max value per tile.)',
            [{ type: 'research', amount: 65 }, { type: 'electronics', amount: 80 }],
            0.03, 0.02,
            1520, 0,
            [{ id: "ailogistics", path: [] }]
        );
    }

    applyEffects(city: City) {
        //Affects placed, unplaced, AND template buildings directly.
        for (const building of city.buildings.concat(city.unplacedBuildings).concat(city.buildingTypes).filter(p => !p.isRestaurant)) {
            if (building.businessPatronCap !== -1) building.businessPatronCap *= 1.6;
            building.businessValue *= 1.3;
        }
    }
}

export class FoodServiceRobots extends Tech {
    constructor() {
        super(
            'foodbots',
            'Food Service Robots',
            'Automated systems for food preparation and service, greatly increasing efficiency in restaurants. (Note: reduces value per patron, but increases max value per tile.)',
            [{ type: 'research', amount: 75 }, { type: 'electronics', amount: 100 }],
            0.02, 0.02,
            1000, 60,
            [{ id: "advrobots", path: [0.5, 0.15] }]
        );
    }

    applyEffects(city: City) {
        //TODO: Move to a city.globalBuildingUpgrade function. Not sure about making it take effect over time with adoption rates. Could just pick random buildings each long tick until it reaches max adoption rate.
        //Affects placed, unplaced, AND template buildings directly.
        for (const building of city.buildings.concat(city.unplacedBuildings).concat(city.buildingTypes).filter(p => p.isRestaurant)) {
            if (building.businessPatronCap !== -1) building.businessPatronCap *= 1.4;
            building.businessValue *= 1.25; //Not a valuable tech early in the game when your businesses can handle all your patrons, but it still comes out to a 30% increase when all the businesses are maxed. In return, diminishes the "10% of tourism can exceed patronage caps" value a bit.
        }
    }
}

export class DroneDelivery extends Tech { //TODO: do the "maintain service" part when you make the events
    constructor() {
        super(
            'dronedelivery',
            'Drone Delivery Systems',
            'Automated aerial delivery systems that reduce traffic and maintain service during adverse weather.',
            [{ type: 'research', amount: 85 }, { type: 'electronics', amount: 120 }],
            0.02, 0.02,
            2120, 140,
            [{ id: "autonomousvehicles", path: [] }]
        );
    }
}

export class TelemedicineInfra extends Tech {
    constructor() {
        super(
            'telemedicine',
            'Telemedicine Infrastructure',
            'Remote healthcare systems that extend the reach and efficiency of medical facilities.',
            [{ type: 'research', amount: 70 }, { type: 'electronics', amount: 90 }],
            0.03, 0.035,
            1240, 580,
            [{ id: "smarthome", path: [] }]
        );
    }

    private static isHospital(p: Building): p is Hospital { //Marginally better than being forced to typecast after filtering by the same condition
        return p instanceof Hospital;
    }

    private static isClinic(p: Building): p is Clinic {
        return p instanceof Clinic;
    }

    override applyEffects(city: City) {
        city.buildings.filter(TelemedicineInfra.isHospital).forEach(p => p.upgradeRadius(city));
        city.buildings.filter(TelemedicineInfra.isClinic).forEach(p => p.upgradeRadius(city));
    }
}

export class NanomedicineResearch extends Tech {
    constructor() {
        super(
            'nanomedicine',
            'Nanomedicine Research',
            'Molecular-scale medical interventions that dramatically improve treatment efficacy in large hospitals.',
            [{ type: 'research', amount: 110 }, { type: 'pharmaceuticals', amount: 150 }],
            0.01, 0.025,
            1520, 580,
            [{ id: "telemedicine", path: [] }]
        );
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") {
            this.description = "Molecular-scale medical interventions that dramatically improve treatment efficacy at DroneDocs.";
        }
    }
}

export class AIDiagnostics extends Tech {
    constructor() {
        super(
            'aidiagnostics',
            'AI Diagnostics',
            'Machine learning systems that improve diagnostic accuracy and reduce healthcare facility costs. Requires a Data Center with >50% efficiency.',
            [{ type: 'research', amount: 90 }, { type: 'electronics', amount: 100 }],
            0.02, 0.025,
            1520, 720,
            [{ id: "telemedicine", path: [] }]
        );
    }
    override isUnavailable(city: City): boolean {
        return !city.buildings.some(p => p instanceof DataCenter && p.lastEfficiency > 0.9);
    }
}

export class VRClassrooms extends Tech {
    constructor() {
        super(
            'vrclassrooms',
            'VR Classrooms',
            'Virtual reality educational environments that enhance learning experiences and reach.',
            [{ type: 'research', amount: 80 }, { type: 'electronics', amount: 110 }],
            0.02, 0.03,
            1520, 440,
            [{ id: "telemedicine", path: [] }]
        );
    }
}

export class BrainComputerInterface extends Tech {
    constructor() {
        super(
            'braininterface',
            'Brain-Computer Interfaces',
            'Direct neural interfaces that dramatically enhance learning and information processing in advanced educational facilities.',
            [{ type: 'research', amount: 150 }, { type: 'electronics', amount: 200 }],
            0.01, 0.03,
            1820, 440,
            [{ id: "vrclassrooms", path: [] }, { id: "nanomedicine", path: [0.35, 0.32] }]
        );
    }
}

export class QuantumComputing extends Tech {
    constructor() {
        super(
            'quantumcomputing',
            'Quantum Computing',
            'Building unlock: Advanced computing systems that solve complex problems exponentially faster than classical computers. Sporadic, random research boosts.',
            [{ type: 'research', amount: 180 }, { type: 'electronics', amount: 250 }],
            1, 1,
            2120, 440,
            [{ id: "braininterface", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(QuantumComputingLab));
    }
}

export class CloudSeeding extends Tech {
    constructor() {
        super(
            'cloudseeding',
            'Cloud Seeding',
            'Building unlock: Weather modification technique that can induce rainfall, shortening the duration of droughts, heatwaves, and cold snaps.',
            [{ type: 'research', amount: 100 }],
            1, 1,
            2120, 300,
            [{ id: "retainingsoil", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(WeatherControlMachine));
    }
}

export class ThermalRecovery extends Tech { //Intent: to save the player some space
    constructor() {
        super(
            'thermalrecovery',
            'Thermal Recovery',
            'A layer of thermoelectric metamaterials increases the efficiency of geothermal, oil, coal, nuclear fission, and nuclear fusion power plants.', //TODO: Tell the player somehow that it's more effective than usual, if they're playing in the Volcanic region
            [{ type: 'research', amount: 250 }, { type: 'copper', amount: 80 }, { type: 'batteries', amount: 20 }],
            0.05, 0.008, //~30 days to fully adopt
            900, 900,
            [{ id: "fusionpower", path: [] }]
        );
    }

    override applyRegionEffects(region: string) {
        if (region === "volcanic") { //Making room for Lightning Rods
            this.displayX = new TelemedicineInfra().displayX;
            this.displayY = 1120;
        }
    }
}

export class GridBalancer extends Tech { //Intent: to reduce the player's self-inflicted punishment for producing too much power
    constructor() {
        super(
            'gridbalancer',
            'Grid Balancer',
            'Reduces power plant upkeep costs when the city is producing more power than it needs.',
            [{ type: 'research', amount: 20 }, { type: 'copper', amount: 20 }, { type: 'electronics', amount: 5 }],
            0.05, 0.025, //~10 days to fully adopt
            320, 720,
            [{ id: "windlattice", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id);
    }

    override applyRegionEffects(region: string) { //Making room for Lightning Rods
        if (region === "volcanic") this.displayY = 920;
    }
}

export class Hydrolox extends Tech {
    constructor() {
        super(
            'hydrolox',
            'Hydrolox',
            'Hydrogen-oxygen rocket fuel that eliminates pollution from space launch sites.',
            [{ type: 'research', amount: 200 }],
            0.05, 0.025, //~10 days to fully adopt
            2380, 300,
            [{ id: "cloudseeding", path: [] }]
        );
    }
}

export class SeismicDampers extends Tech {
    constructor() {
        super(
            'seismicdampers',
            'Seismic Dampers',
            'Advanced structural systems that absorb and redirect seismic energy, protecting buildings from all earthquake damage.',
            [{ type: 'research', amount: 60 }, { type: 'steel', amount: 80 }],
            0.04, 0.008, // ~30 days to fully adopt
            360, 520,
            [{ id: "windlattice", path: [] }]
        );
    }

    override applyEffects(city: City) {
        // The actual earthquake protection will be handled by the event system
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id);
    }

    override canBecomeAvailableInRegion(region: string): boolean {
        return region === "volcanic";
    }
}

export class LightningRods extends Tech {
    constructor() {
        super(
            'lightningrods',
            'Lightning Rods',
            'Lightning rods that protect buildings from lightning strikes, preventing damage.',
            [{ type: 'research', amount: 50 }, { type: 'copper', amount: 90 }],
            0.04, 0.008, // ~30 days to fully adopt, BUT it adjusts the probability of Dry Lightning triggering instead of reducing damage by that fraction.
            760, 920, //To make room, I moved Grid Balancer, Rooftop Solar Panels, Perovskite-Blend Solar Cells, Geothermal Power, Fusion Power, Thermal Recovery, AND Breeder Reactor
            [{ id: "rooftopsolar", path: [] }]
        );
    }
    // The actual lightning protection will be handled by the event system

    override canBecomeAvailableInRegion(region: string): boolean {
        return region === "volcanic";
    }
}

export const TECH_TYPES: Tech[] = [
    AIDiagnostics, AILogistics, ARShopping, AdvancedRobotics, AutonomousVehicles, BrainComputerInterface,
    BreederReactor, CarbonCapture, CloudSeeding, CoalPowerScrubbers, DroneDelivery, FoodServiceRobots,
    FusionPower, GMCrops, Geothermal, GrapheneBatteries, GridBalancer, HeatPumps, Hydrolox, HydroponicGardens, Incubators, LabGrownMeat,
    LightningRods, NanomedicineResearch, PerovskiteSolarCells, QuantumComputing, RetainingSoil, RooftopSolar, SeismicDampers, SmartHomeSystems,
    TelemedicineInfra, ThermalRecovery, ThreeDPrinting, VRClassrooms, VacuumInsulatedWindows, VerticalFarming, WindTurbineLattice,
].map(p => new p());
