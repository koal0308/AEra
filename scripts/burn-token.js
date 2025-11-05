const hre = require("hardhat");
const { ethers } = require("ethers");
require('dotenv').config({ path: '.env.local' });

async function main() {
    const AERA_TOKEN_ADDRESS = process.env.AERA_TOKEN_ADDRESS;
    const AMOUNT_TO_BURN = "1000000000000000000"; // 1 AERA Token (18 decimals)
    
    if (!AERA_TOKEN_ADDRESS || AERA_TOKEN_ADDRESS === 'your_deployed_contract_address_here') {
        console.log('❌ AERA_TOKEN_ADDRESS not set in .env.local');
        process.exit(1);
    }
    
    console.log('\n🔥 AERA TOKEN BURN TEST\n');
    console.log(`📍 Contract: ${AERA_TOKEN_ADDRESS}`);
    console.log(`🔥 Amount to Burn: 1 AERA`);
    console.log(`🌐 Network: Sepolia Testnet\n`);
    
    try {
        // Get contract instance
        const AeraToken = await hre.ethers.getContractAt('AeraToken', AERA_TOKEN_ADDRESS);
        
        // Get signer
        const [signer] = await hre.ethers.getSigners();
        console.log(`👤 Signer Address: ${signer.address}\n`);
        
        // Check balance before burn
        const balanceBefore = await AeraToken.balanceOf(signer.address);
        console.log(`💰 Balance BEFORE burn: ${ethers.utils.formatEther(balanceBefore)} AERA`);
        
        // Check total supply before burn
        const totalSupplyBefore = await AeraToken.totalSupply();
        console.log(`📈 Total Supply BEFORE burn: ${ethers.utils.formatEther(totalSupplyBefore)} AERA\n`);
        
        // Perform burn
        console.log('⏳ Burning 1 AERA token...');
        const tx = await AeraToken.burn(AMOUNT_TO_BURN);
        console.log(`📝 Transaction Hash: ${tx.hash}`);
        console.log(`⏳ Waiting for confirmation...\n`);
        
        const receipt = await tx.wait();
        console.log(`✅ Burn successful!\n`);
        console.log(`🔥 Block: ${receipt.blockNumber}`);
        console.log(`⛽ Gas Used: ${receipt.gasUsed.toString()}`);
        
        // Check balance after burn
        const balanceAfter = await AeraToken.balanceOf(signer.address);
        console.log(`💰 Balance AFTER burn: ${ethers.utils.formatEther(balanceAfter)} AERA`);
        console.log(`🔥 Amount Burned: ${ethers.utils.formatEther(AMOUNT_TO_BURN)} AERA`);
        
        // Check total supply after burn
        const totalSupplyAfter = await AeraToken.totalSupply();
        console.log(`📈 Total Supply AFTER burn: ${ethers.utils.formatEther(totalSupplyAfter)} AERA\n`);
        
        // Verify the burn
        const burnedAmount = totalSupplyBefore.sub(totalSupplyAfter);
        console.log(`✅ Verified: ${ethers.utils.formatEther(burnedAmount)} AERA permanently removed from supply\n`);
        
        console.log('🎉 Token Burn Test Complete!');
        console.log(`📊 Transaction: https://sepolia.etherscan.io/tx/${tx.hash}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
