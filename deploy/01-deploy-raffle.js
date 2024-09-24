const { network, ethers } = require("hardhat");
const {
    developmentChains,
    networkConfig,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

const VRF_SUB_FUND_AMOUNT = ethers.parseEther("20");

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments;
    const signers  = await ethers.getSigners();
    const deployer = signers[0];
    //console.log(deployer);
    //const { deployer } = await getNamedAccounts();
    //console.log(deployer);
    const chainId = network.config.chainId;

    /* args variables for deploying contract */
    let vrfCoordinatorV2Address, subscriptionId, VRFCoordinatorV2Mock; // we need this, in order to pass to our args

    if (developmentChains.includes(network.name)) {
        //if we are in development chain, our VRFCoordinatorV2Address is the address of VRFCoordinatorV2Mock contract
        const vrfCoordinatorV2MockDeployment = await deployments.get("VRFCoordinatorV2Mock");
        //console.log(vrfCoordinatorV2MockDeployment);
        VRFCoordinatorV2Mock = await ethers.getContractAt(
                  vrfCoordinatorV2MockDeployment.abi,
                  vrfCoordinatorV2MockDeployment.address,
                  deployer
              );
        //const VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
        vrfCoordinatorV2Address = await VRFCoordinatorV2Mock.getAddress();
        //to get the subscriptionId
        const transactionResponse =
            await VRFCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await transactionResponse.wait(1);
        //^ Inside this transactionReceipt there is actually an event that is emitted with the subscription, that we can get.
        subscriptionId = transactionReceipt.logs[0].args.subId;
        //alternate way to get the event, by searching for it's name
        // const event = transactionReceipt.logs.find(
        //     (log) => log.fragment.name === "SubscriptionCreated",
        // );

        // subscriptionId = event.args.subId;
        //console.log(subscriptionId);
        //Fund the subscription
        //Usually, in a real network we need the link token
        //but here, we can do it without link
        await VRFCoordinatorV2Mock.fundSubscription(
            subscriptionId,
            VRF_SUB_FUND_AMOUNT,
        );
    } else {
        //if we are not in development chain, our VRFCoordinatorV2Address is derived from helper-hardhat-config
        //as it's deployed in Sepolia network
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
        //for real network, we create the subscription Id in UI and add it to helper-hardhat-config
        subscriptionId = networkConfig[chainId]["subscriptionId"];
    }
    const entranceFee = networkConfig[chainId]["entranceFee"];
    const gasLane = networkConfig[chainId]["gasLane"];
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"];
    const interval = networkConfig[chainId]["interval"];
    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval,
    ];
    const raffle = await deploy("Raffle", {
        from: deployer.address,
        args: args,
        log: true,
        //waitConfirmations: 1,
    });

    //Add the contract as consumer
    if(developmentChains.includes(network.name)) {
        await VRFCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address);
    }

    //Verification
    if (
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        log(`Verifying contract ${raffle.address} ${args}`);
        //not a mock contract and we have a etherscan api key -> do the verification
        await verify(raffle.address, args);
        log("Verified contract");
    }
    log("---------------------------------------------------------------");
};

module.exports.tags = ["all", "raffle"];
