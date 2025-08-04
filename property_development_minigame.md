# Property Development Acceleration Minigame

## Core Concept
The player manages a **Property Development Dashboard** where they can execute various "abilities" to attract tenants and speed up building upgrades. Each ability costs resources and provides different benefits, culminating in a strategic resource management minigame. The primary end result is that the residence the player selected--a house, quadplex, apartment, or highrise--gets upgraded if the player completes the minigame. Secondary effects are positive and negative area effects around the building in the main game with a radius of 3.

## Relevant facts about the main game
The main game supports these effects: PettyCrime, OrganizedCrime, PoliceProtection, ParticulatePollution, GreenhouseGases, Noise, LandValue, FireHazard, FireProtection, Education, Healthcare, BusinessPresence, Luxury, PublicTransport, BusinessValue. Of those, only FireHazard is not an *area* effect, but instead applies to a specific building.

Resources include:
/*Food*/ Apples, Berries, Dairy, Fish, Grain, LabGrownMeat, LeafyGreens, Legumes, PlantBasedDairy, Poultry, RedMeat, RootVegetables, VitaminB12,
/*Building materials*/ Concrete, Glass, Iron, Bricks, Clay, Lumber, Steel, Stone, Wood,
/*Fuel and ingredients*/ Coal, Copper, Gemstones, Lithium, Oil, Plastics, Rubber, Sand, Silicon, Textiles, Tritium, Uranium,
/*Manufactured goods*/ Apps, Batteries, Clothing, Electronics, Furniture, Paper, Pharmaceuticals, Toys
...as well as Flunds (currency), Research, Population, and Tourists
...and some constantly produced/consumed resources, namely Power and Water.
...plus some are only available in Volcanic region cities: Obsidian, GreenObsidian, FireObsidian, Sulfur, Dynamite.

## Core Mechanics

### Minigame-Only Resources
- **Appeal Points** - how attractive the property is to tenants
- **Construction Progress** - how close the building is to upgrading
- **Reputation** - affects success rates of social abilities

### Game Flow
- **Random ability selection**: The player always has a hand of 3 abilities; upon using or banking one, another takes its place
- **One-time use**: Most abilities can only be used once per game session
- **Time pressure**: Stats slowly decay if player takes too long to decide
- **Fail condition**: If no abilities can be afforded, triggers area effects in main game

### Turn Structure
1. **Ability selection phase** - choose from current random options
2. **Effect resolution** - positive and negative effects apply
3. **Replacement** - used abilities get replaced by new random ones

## Ability Categories & Examples

### 🏗️ **Construction Abilities**
- **Blueprint Refinement**: Spend Paper + Flunds → Boost Construction Progress, *minor noise pollution increase*
- **Crane Operations**: Spend Steel + Flunds → Major Construction Progress boost, *temporary noise pollution + particulate pollution, reduced by certain techs in the main game*
- **Material Delivery**: Spend Lumber/Concrete/Bricks → Steady Construction Progress, *minor particulate pollution increase, reduced by certain techs in the main game*
- **Permit Expediting**: Spend Flunds (high cost) → Skip bureaucratic delays, *slight reputation hit*

### 👥 **Tenant Attraction Abilities**
- **Professional Staging**: Spend Furniture + Textiles → High Appeal boost for families, *increases luxury expectation*
- **Tech Showcase**: Spend Electronics + Apps → Appeal boost for young professionals, *slight noise pollution from demos*
- **Luxury Amenities**: Spend Gemstones + Furniture → Appeal boost for wealthy tenants, *increases petty crime risk*
- **Pet-Friendly Setup**: Spend Food + Toys → Appeal boost for pet owners, *minor noise pollution from pets*

### 📱 **Marketing Abilities**
- **Premium Listing**: Spend Flunds + Electronics → Attract high-quality tenants, *raises area land value expectations*
- **Social Media Campaign**: Spend Apps + Flunds → Broad appeal increase, *slight reputation vulnerability*
- **Food Truck Event**: Spend Food items + Flunds → Temporary big appeal boost, *temporary noise + particulate pollution, reduced by certain techs in the main game*
- **Influencer Partnership**: Spend Clothing + Electronics → Reputation + Appeal, *creates unrealistic expectations*

### 🤝 **Social Engineering Abilities**
- **Rumor Network**: Spend Flunds → Build neighborhood reputation, *small risk of organized crime attention*
- **Community BBQ**: Spend Food (Poultry/RedMeat) → Reputation boost, *particulate pollution increase, reduced by certain techs in the main game*
- **Charity Drive**: Spend Pharmaceuticals/Clothing → Reputation boost, *slight business presence decrease*
- **Investor Dinner**: Spend Dairy + Fish + Flunds → Attract co-funding, *increases luxury expectations*

### 💰 **Financial Abilities**
- **Move-in Incentives**: Spend Flunds → Guaranteed tenant applications, *reduces future rent expectations*
- **Utility Subsidies**: Spend Batteries + Flunds → Higher appeal, *creates ongoing cost expectations*
- **Renovation Loans**: Gain Flunds now → Pay back with interest, *debt pressure affects future decisions*
- **Bulk Material Orders**: Spend extra Flunds → Discounted materials, *temporary business presence increase*

## Strategic Depth

### Negative Consequences
Every ability has trade-offs that affect the main game:
- **Construction activities** → Noise and particulate pollution (reduced by certain techs in the main game)
- **Luxury improvements** → Attract crime or raise expectations
- **Marketing efforts** → Create future pressure or vulnerabilities
- **Social activities** → Unintended attention or ongoing costs

### Resource Scarcity & Randomization
- **Limited choices**: Only 3-7 random abilities available per round
- **One-time use**: Most abilities disappear after use, replaced by new random options
- **Strategic adaptation**: Players must work with what they're given
- **Resource hoarding**: Saving resources for better future options vs. using current ones

### Combo & Timing System
- **Ability Banking**: Hold 1 ability in reserve without paying upfront cost
- **Combo Bonuses**: Certain ability pairs provide enhanced effects when used consecutively
- **Hidden Synergies**: Combo effects are discovered through experimentation, not shown upfront
- **Forced Execution**: Banked abilities auto-execute at 50% effectiveness after 4 turns
- **No Decay**: Banked abilities maintain full power until forced execution

### Time Pressure & Skill Elements
- **Stat Decay**: Appeal Points and Reputation slowly decrease during decision-making, starting after 7 seconds
- **Setup Abilities**: Some abilities enhance the effectiveness of subsequent related abilities
- **Market Timing**: Early-game vs late-game optimal ability usage
- **Economic Cycles**: Some abilities generate resources over time, others provide immediate benefits

## Hidden Combo System

### **Construction Synergies**
- **Blueprint Refinement → Crane Operations**: +50% Construction Progress, reduces noise pollution
- **Material Delivery → Permit Expediting**: Eliminates bureaucratic delays, removes reputation hit
- **Bulk Material Orders → Any Construction**: Next construction ability costs 50% fewer materials

### **Marketing Synergies**  
- **Social Media Campaign → Influencer Partnership**: Viral effect doubles reputation gain
- **Food Truck Event → Community BBQ**: Creates "festival atmosphere" - massive temporary appeal boost
- **Premium Listing → Professional Staging**: "Model Home" effect attracts premium tenants instantly

### **Social Engineering Synergies**
- **Charity Drive → Rumor Network**: Positive reputation spreads faster, reduces organized crime attention
- **Community BBQ → Investor Dinner**: "Networking event" attracts multiple investors, reduces individual costs
- **Rumor Network → Any Marketing**: Enhanced credibility makes marketing 75% more effective

### **Economic Synergies**
- **Renovation Loans → Any Construction**: Debt leveraging provides +25% construction progress
- **Move-in Incentives → Utility Subsidies**: "Complete package" eliminates future cost expectations
- **Investor Dinner → Premium Listing**: Co-funding allows luxury marketing without personal cost

### **Cross-Category Synergies**
- **Tech Showcase → Social Media Campaign**: Tech-savvy audience amplifies online presence
- **Luxury Amenities → Investor Dinner**: Impresses investors, reduces co-funding requirements
- **Pet-Friendly Setup → Charity Drive**: Animal welfare angle boosts community reputation
- **Permit Expediting → Food Truck Event**: Fast permits allow immediate event scheduling

## Economic Cycles & Timing Optimization

### **Early Game (Turns 1-4)**
- **Foundation Phase**: Construction abilities are 25% more effective
- **Resource Abundance**: Material costs reduced by 20%
- **Optimal abilities**: Blueprint Refinement, Material Delivery, Bulk Orders

### **Mid Game (Turns 5-8)** 
- **Marketing Phase**: Social abilities are 25% more effective
- **Reputation Building**: All reputation gains doubled
- **Optimal abilities**: Social Media Campaign, Community BBQ, Charity Drive

### **Late Game (Turns 9+)**
- **Closing Phase**: Financial abilities are 25% more effective  
- **Tenant Finalization**: Appeal-to-tenant conversion rate increased
- **Optimal abilities**: Move-in Incentives, Utility Subsidies, Premium Listing

### **Resource Generation Over Time**
- **Investor Partnerships**: Generate 20 Flunds every turn after activation
- **Business Presence**: Increases material delivery efficiency (cheaper costs)
- **Reputation**: Improves impact of all future social abilities
- **Established Appeal**: Generates passive tenant applications without further marketing

### Fail Condition with Consequences
If player cannot afford ANY current abilities:
- **Immediate effect**: Temporary boost to **Business Presence** in the area (desperate measures attract attention)
- **Side effect**: Small increase in **Petty Crime** (vulnerability during stalled development)
- **Recovery**: Player gets 3 new random low-cost abilities to choose from

### Victory Conditions
- Reach **Construction Progress** threshold OR
- Attract enough **high-value tenants** to justify upgrade OR  
- Accumulate enough **Appeal Points** to trigger natural upgrade
- **Bonus**: Complete with minimal negative area effects for reputation bonus
- **Master**: Discover and execute 3+ combos for maximum efficiency rating

## UI/UX Design
- **Dashboard view** showing current resources, progress bars, and available abilities
- **Ability cards** that show costs, effects, and current availability
- **Tenant pipeline** showing incoming applications and their value
- **Progress tracker** showing how close you are to building upgrade
- **Resource ticker** showing current inventory with color-coded abundance/scarcity
