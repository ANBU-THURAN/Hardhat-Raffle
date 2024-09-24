const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.parseEther("0.25"); //It costs 0.25 LINK per request
const GAS_PRICE_LINK = 1e9; // sort of like `Link per gas`
// ^ This is a calculated value based on the gas price of the chain

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const args = [BASE_FEE, GAS_PRICE_LINK];

    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mocks...");
        //we have to deploy a mock VRFCoordinatorV2

        const mockVRFCoordinator = await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: args,
            log: true,
        });

        log("Mocks Deployed !");
        log("----------------------------------------------------------------");
    }
};

module.exports.tags = ["all", "mocks"];
