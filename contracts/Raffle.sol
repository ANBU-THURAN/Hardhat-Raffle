//SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

import {VRFCoordinatorV2Interface} from "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";
import {VRFConsumerBaseV2} from "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import {AutomationCompatibleInterface as KeeperCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpKeepNotNeeded(
    uint256 currentBalance,
    uint256 numPlayers,
    uint256 raffleState
);

/**
 * @title A Sample Raffle Contract
 * @author Anbu Thuran
 * @notice This contract is for creating an untamperable decentralized raffle
 * @dev This implements ChainLink VRF V2 and ChainLink Keepers
 */
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type Declarations */
    enum RaffleState {
        OPEN,
        CALCULATING
    } //uint256 0=OPEN, 1=CALCULATING

    /* State variables */

    //entrance fee to enter the raffle
    uint256 private immutable i_entranceFee;

    //list of players (Addresses) [that have entered the raffle]
    address payable[] private s_players;

    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;

    //Needed for requesting randomWord

    bytes32 private immutable i_gasLane;
    uint256 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    //Lottery variables

    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /* events */

    event RaffleEnter(address indexed player);
    event requestedRandomWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    //Enter the raffle
    function enterRaffle() public payable {
        // require(msg.value > i_entranceFee, "Not enough ETH");
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        s_players.push(payable(msg.sender)); // we need to typecast msg.sender(address) to payable address
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that ChainLink Keeper nodes call, they
     * look for the `upkeepNeeded` to return true
     * The following should be true
     * 1. Our time interval should have passed
     * 2. Our contract should have atleast one player and have some ETH
     * 3. Our subscription is funded with LINK.
     * 4. The lottery should be in `open` state
     */
    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        override
        returns (bool upkeepNeeded, bytes memory /*performData*/)
    {
        bool isTimeIntervalPassed = ((block.timestamp - s_lastTimeStamp) >
            i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        upkeepNeeded = (isTimeIntervalPassed &&
            hasPlayers &&
            hasBalance &&
            isOpen);
    }

    //Pick a random winner
    function performUpkeep(bytes calldata /* performData */) external override {
        (bool upKeepNeeded, ) = checkUpkeep("");
        //To make sure that performUpKeep is only called when upkeep is needed. (i.e only called by chainlink node)
        if (!upKeepNeeded) {
            revert Raffle__UpKeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            uint64(i_subscriptionId),
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit requestedRandomWinner(requestId);
    }

    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory randomWords
    ) internal override {
        //to get the index of winner, we are using modulo to make sure we get a number within players array length
        // [0] because we only requested for one random word
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        // to get the address of the winner
        address payable recentWinner = s_players[indexOfWinner];
        //We will store this winner in a seperate variable
        s_recentWinner = recentWinner;
        //Once we pick the winner, we can make the raffle open
        s_raffleState = RaffleState.OPEN;
        //reinitialize the players array as we've picked the winner
        s_players = new address payable[](0);
        //reset the last time stamp
        s_lastTimeStamp = block.timestamp;
        //send all the money in contract to the winner
        (bool success, ) = recentWinner.call{value: address(this).balance}("");

        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayers(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
