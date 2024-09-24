const { deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } =
    require("../../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)?
describe("Raffle", function () {
    let raffle, entranceFee, deployer;

    beforeEach(async function () {
        const signers  = await ethers.getSigners();
        deployer = signers[0];
        
        await deployments.fixture(["all"]);

        const RaffleDeployment = await deployments.get("Raffle");
        raffle = await ethers.getContractAt(
            RaffleDeployment.abi,
            RaffleDeployment.address,
            deployer
        );

        entranceFee = await raffle.getEntranceFee();
    });

    describe("fulfillRandomWords", function() {
        it("works with Chainlink keepers and Chainlink VRF, we get a random winner", async function() {
            const startingTimeStamp = await raffle.getLastTimeStamp();
            await new Promise(async (resolve, reject) =>{
                //Setting up the listener
                raffle.once("WinnerPicked", async ()=> {
                    try {
                        const recentWinner = await raffle.getRecentWinner();
                        const raffleState = await raffle.getRaffleState();
                        const endingTimeStamp = await raffle.getLastTimeStamp();
                        const numPlayers = await raffle.getNumberOfPlayers();
                        const winnerEndingBalance = await deployer.getBalance();
                        
                        await expect(raffle.getPlayers(0)).to.be.reverted();
                        assert.equal(recentWinner.toString(), deployer.address);
                        assert.equal(raffleState, "0");
                        assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(entranceFee).toString());
                        assert(endingTimeStamp > startingTimeStamp);
                    } catch (e) {
                        console.log(e);
                        reject(e);
                    }
                    resolve();
                });

                await raffle.enterRaffle({value : entranceFee});
                const winnerStartingBalance = await deployer.getBalance();
            });




        });
    })
}) : describe.skip;