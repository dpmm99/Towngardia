import { TitleTypes } from "./AchievementTypes.js";
import { Building } from "./Building.js";
import { AlgaeFarm, CarbonCapturePlant, Carnicultivator, Clinic, DataCenter, Farm, FusionFuelTruck, FusionPowerPlant, GeothermalPowerPlant, Hospital, Nanogigafactory, QuantumComputingLab, ShowHome, TreeFarm, VerticalFarm, WeatherControlMachine, getBuildingType } from "./BuildingTypes.js";
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
}

export class VacuumInsulatedWindows extends Tech {
    constructor() {
        super(
            'vacuumwindows',
            'Vacuum Insulated Windows',
            'These windows use a vacuum between panes to dramatically reduce heat transfer, improving building energy efficiency. They also greatly help with noise pollution.',
            [{ type: 'research', amount: 20 }, { type: 'glass', amount: 50 }],
            0.05, 0.02,
            200, 240,
            [{ id: "heatpumps", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id);
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
            440, 720,
            [{ id: "windlattice", path: [] }]
        );
    }
}

export class SmartHomeSystems extends Tech {
    constructor() {
        super(
            'smarthome',
            'Smart Home Systems',
            'Integrated systems that optimize energy usage in homes through automated control of heating, cooling, and appliances.',
            [{ type: 'research', amount: 25 }, { type: 'electronics', amount: 50 }, { type: 'plastics', amount: 30 }],
            0.03, 0.015,
            520, 300,
            [{ id: "vacuumwindows", path: [0.5255, 0.155] }, { id: "windlattice", path: [0.5, 0.2] }]
        );
    }

    override applyEffects(city: City) {
        city.unlock(getBuildingType(ShowHome));
    }
}

export class CoalPowerScrubbers extends Tech {
    constructor() {
        super(
            'coalscrubbers',
            'Coal Power Scrubbers',
            'Advanced filtration systems that significantly reduce pollutant emissions from coal power plants.',
            [{ type: 'research', amount: 40 }, { type: 'steel', amount: 100 }, { type: 'coal', amount: 20 }],
            0.1, 0.05,
            200, 0,
            [{ id: "heatpumps", path: [] }]
        );
    }

    override applyEffects(city: City) {
        city.checkAndAwardTitle(TitleTypes.Pioneergreen.id);
    }
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
            building.inputResources.find(p => p.type === 'tritium')!.consumptionRate *= 0.25;
            building.inputResources.push(new Lithium(0, 0, 0.25, 0.25 * 2 * CAPACITY_MULTIPLIER)); //Twice the usual capacity since power is pretty important
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
            'AI systems that optimize warehouse operations, improving storage efficiency for complex goods. Requires a Data Center.',
            [{ type: 'research', amount: 70 }, { type: 'electronics', amount: 80 }],
            0.03, 0.03,
            1240, 0,
            [{ id: "advrobots", path: [] }]
        );
    }
    override isUnavailable(city: City): boolean {
        return !city.buildings.some(p => p instanceof DataCenter && p.poweredTimeDuringLongTick > 0.5);
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
            'Advanced manufacturing facilities that use additive processes, reducing plastic waste in production.',
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

    override applyEffects(city: City) {
        //Affects placed, unplaced, AND template buildings directly. Production rate is handled in the buildings' onLongTick.
        const isFarm = (p: Building): boolean => p instanceof Farm || p instanceof VerticalFarm || p instanceof TreeFarm || p instanceof AlgaeFarm;
        for (const building of city.buildings.filter(isFarm).concat(city.unplacedBuildings.filter(isFarm)).concat(city.buildingTypes.filter(isFarm))) {
            for (const resource of building.outputResources.concat(building.outputResourceOptions)) {
                resource.capacity *= 1.3334;
            }
        }
    }
}

export class RetainingSoil extends Tech { //TODO: the water usage part
    constructor() {
        super(
            'retainingsoil',
            'Retaining Soil',
            'Advanced soil management techniques that improve water retention and reduce the impact of droughts.',
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
            'Self-driving vehicles that reduce traffic congestion and improve transportation efficiency.',
            [{ type: 'research', amount: 100 }, { type: 'electronics', amount: 150 }, { type: 'batteries', amount: 30 }],
            0.05, 0.025, //~10 days to fully adopt
            1820, 140,
            [{ id: "graphenebattery", path: [] }]
        );
    }
}

export class ARShopping extends Tech {
    constructor() {
        super(
            'arshopping',
            'AR Shopping Experiences',
            'Augmented reality systems that enhance retail experiences, boosting sales and customer capacity.',
            [{ type: 'research', amount: 65 }, { type: 'electronics', amount: 80 }],
            0.03, 0.02,
            1520, 0,
            [{ id: "ailogistics", path: [] }]
        );
    }

    applyEffects(city: City) {
        //Affects placed, unplaced, AND template buildings directly.
        for (const building of city.buildings.concat(city.unplacedBuildings).concat(city.buildingTypes).filter(p => !p.isRestaurant)) {
            if (building.businessPatronCap !== -1) building.businessPatronCap *= 1.1;
            building.businessValue *= 1.15;
        }
    }
}

export class FoodServiceRobots extends Tech {
    constructor() {
        super(
            'foodbots',
            'Food Service Robots',
            'Automated systems for food preparation and service, increasing efficiency in restaurants.',
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
            if (building.businessPatronCap !== -1) building.businessPatronCap *= 1.1;
            building.businessValue *= 1.15;
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
}

export class AIDiagnostics extends Tech {
    constructor() {
        super(
            'aidiagnostics',
            'AI Diagnostics',
            'Machine learning systems that improve diagnostic accuracy and reduce healthcare facility costs. Requires a Data Center.',
            [{ type: 'research', amount: 90 }, { type: 'electronics', amount: 100 }],
            0.02, 0.025,
            1520, 720,
            [{ id: "telemedicine", path: [] }]
        );
    }
    override isUnavailable(city: City): boolean {
        return !city.buildings.some(p => p instanceof DataCenter && p.poweredTimeDuringLongTick > 0.5);
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
            'Building unlock: Weather modification technique that can induce rainfall, shortening the duration of droughts and heatwaves.',
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

export const TECH_TYPES: Tech[] = [
    AIDiagnostics, AILogistics, ARShopping, AdvancedRobotics, AutonomousVehicles, BrainComputerInterface,
    BreederReactor, CarbonCapture, CloudSeeding, CoalPowerScrubbers, DroneDelivery, FoodServiceRobots,
    FusionPower, GMCrops, Geothermal, GrapheneBatteries, HeatPumps, HydroponicGardens, LabGrownMeat,
    NanomedicineResearch, PerovskiteSolarCells, QuantumComputing, RetainingSoil, RooftopSolar, SmartHomeSystems,
    TelemedicineInfra, ThreeDPrinting, VRClassrooms, VacuumInsulatedWindows, VerticalFarming, WindTurbineLattice,
].map(p => new p());
