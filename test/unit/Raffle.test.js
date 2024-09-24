const { deployments, getNamedAccounts, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } =
    require("../../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, vrfCoordinatorV2Mock, entranceFee, deployer, interval;

          const chainId = network.config.chainId;
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

              const vrfCoordinatorV2MockDeployment = await deployments.get("VRFCoordinatorV2Mock");
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  vrfCoordinatorV2MockDeployment.abi,
                  vrfCoordinatorV2MockDeployment.address,
                  deployer
              );

              entranceFee = await raffle.getEntranceFee();
              interval = await raffle.getInterval();
          });

          describe("constructor", function () {
              it("initialized the contract correctly", async function () {
                  //Ideally we have only one assert per "it"
                  //to make sure it is initialized properly, we check the raffleState as it is initialized in constructor
                  const raffleState = await raffle.getRaffleState();
                  assert.equal(raffleState.toString(), "0");
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["interval"],
                  );
              });
          });

          describe("enterRaffle", function () {
            it("reverts when you don't pay enough", async function () {
                await expect(
                    raffle.enterRaffle({
                        value: ethers.parseEther("0.001"),
                    })
                ).to.be.revertedWithCustomError(raffle, "Raffle__NotEnoughETHEntered");
            });

            it("records players when they enter", async function () {
                await raffle.enterRaffle({value: entranceFee});
                const player = await raffle.getPlayers(0);
                console.log(`${player} ---- ${deployer}`);
                assert.equal(player, deployer.address);
            }); 

            it("emits an event when they enter", async function () {
                await expect(raffle.enterRaffle({value: entranceFee})).to.emit(raffle, "RaffleEnter");
            });

            it("doesn't allow entrance when raffle is calculating", async function () {
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]); //mines one extra block
                //await network.provider.request({method: "evm_mine", params: []}) --- alternative to above line
                //Now, we pretend to be Chainlink Keeper
                await raffle.performUpkeep("0x"); //Now, raffle will be in "calculating" state
                await expect(raffle.enterRaffle({value: entranceFee})).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen");
            });

        });

        describe("checkUpkeep()", function() {
            it("returns false if people haven't sent any ETH", async function() {
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]);
                const {upkeepNeeded} = await raffle.checkUpkeep.staticCall("0x");
                assert.equal(upkeepNeeded, false);
            });
            
            it("returns false if raffle isn't open", async function() {
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]);
                await raffle.performUpkeep("0x");
                //Now the raffle is in calculating state
                const {upkeepNeeded} = await raffle.checkUpkeep.staticCall("0x");
                assert.equal(upkeepNeeded, false);
            });

            it("returns false if enough time hasn't passed", async function() {
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() - 30]);
                await network.provider.send("evm_mine",[]);
                const {upkeepNeeded} = await raffle.checkUpkeep.staticCall("0x");
                assert.equal(upkeepNeeded, false);
            });

            it("returns true if enough time has passed, has players and has ETH and is open", async function() {
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]);
                const {upkeepNeeded} = await raffle.checkUpkeep.staticCall("0x");
                assert.equal(upkeepNeeded, true);
            });
        });

        describe("performUpkeep", function() {

            it("it can only run if checkupkeep is true", async function() {
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]);
                const txResponse = await raffle.performUpkeep("0x");
                assert(txResponse);
            });
            
            it("reverts if checkUpKeep is not needed", async function() {
                await raffle.enterRaffle({value: entranceFee});
                // await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                // await network.provider.send("evm_mine",[]);
                await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(raffle, "Raffle__UpKeepNotNeeded");
            });

            it("emits an event when random winner is requested", async function() {
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]);
                await expect(raffle.performUpkeep("0x")).to.emit(raffle, "requestedRandomWinner");
            });

            it("changes raffle state to calculating", async function() {
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]);
                await raffle.performUpkeep("0x");
                const raffleState = await raffle.getRaffleState();
                assert.equal(raffleState, "1");
            });
        });

        describe("fulfillRandomWords", function() {

            beforeEach(async function() {
                //We need someone entered in the lottery before testing fulfillRandomWords
                await raffle.enterRaffle({value: entranceFee});
                await network.provider.send("evm_increaseTime", [interval.toString() + 1]);
                await network.provider.send("evm_mine",[]);
            });

            it("can only be called after performUpkeep", async function() {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target)).to.be.revertedWith("nonexistent request");
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target)).to.be.revertedWith("nonexistent request");
            });

            it("picks a winner, resets the lottery and sends money", async function() {
                //We are making multiple entries in the raffle before testing
                const additionalEntrances = 3;
                const startingAccountIndex = 1;
                const signers =  await ethers.getSigners();
                for(let i=startingAccountIndex; i<startingAccountIndex + additionalEntrances; i++) {
                    const signer = signers[i];
                    const accountConnectedRaffle = await raffle.connect(signer);
                    await accountConnectedRaffle.enterRaffle({value: entranceFee});
                }

                const startingTimeStamp = await raffle.getLastTimeStamp();
                //Things to do
                //call performUpKeep (mock being chainlink keepers)
                //call fulfillRandomWords (mock being the ChainLink VRF)
                //(If it's a real blockchain, we will have to wait for the fulfillRandomWords to be called but here we are calling it,
                // to mock the behavior)
                //but we are still using a promise just like how we would do in staging test
                await new Promise(async (resolve, reject) =>{
                    //Setting up the listener
                    raffle.once("WinnerPicked", async ()=> {
                        try {
                            //...we need to do stuff here
                            const recentWinner = await raffle.getRecentWinner();
                            const raffleState = await raffle.getRaffleState();
                            const endingTimeStamp = await raffle.getLastTimeStamp();
                            const numPlayers = await raffle.getNumberOfPlayers();
                            assert.equal(raffleState, "0");
                            assert.equal(numPlayers, 0);
                            assert(endingTimeStamp > startingTimeStamp);
                            
                            
                        } catch (e) {
                            reject(e);
                        }
                        resolve();
                    });
                    //below , we will fire the event and the listener will pick it up and resolve
                    const tx = await raffle.performUpkeep("0x");
                    const txReceipt = await tx.wait(1);
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.logs[1].args.requestId,
                        raffle.target
                    );

                });
            });

        });


    });
