const Driver = require('../models/Driver');

const generateUniqueReferralCode = async () => {
    while (true) {
        const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newCode = `KWIK${randomString}`;
        const existing = await Driver.findOne({ referralCode: newCode });
        if (!existing) {
            return newCode;
        }
    }
};

const migrateReferralCodes = async () => {
    try {
        console.log('[Migration] Starting Driver Referral Code migration...');
        
        // Find all drivers where referralCode is missing, null, or empty string
        const driversToMigrate = await Driver.find({ 
            $or: [
                { referralCode: { $exists: false } },
                { referralCode: null },
                { referralCode: "" }
            ] 
        });

        if (driversToMigrate.length === 0) {
            console.log('[Migration] No drivers need referral codes. Migration complete.');
            return;
        }

        console.log(`[Migration] Found ${driversToMigrate.length} drivers without referral codes. Generating...`);

        let updatedCount = 0;
        for (const driver of driversToMigrate) {
            const newCode = await generateUniqueReferralCode();
            driver.referralCode = newCode;
            await driver.save();
            updatedCount++;
            
            // Log progress every 100 drivers
            if (updatedCount % 100 === 0) {
                console.log(`[Migration] Updated ${updatedCount}/${driversToMigrate.length} drivers...`);
            }
        }

        console.log(`[Migration] Successfully generated referral codes for ${updatedCount} drivers!`);
    } catch (error) {
        console.error('[Migration] Error migrating referral codes:', error);
    }
};

module.exports = migrateReferralCodes;
