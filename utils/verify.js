const { run } = require("hardhat");

async function verify(contractAddress, args) {
    console.log(`Verifying contract : ${contractAddress}`);
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        });
    } catch (err) {
        if (err.message.toLowerCase().includes("already verified")) {
            console.log("Already verified");
        } else {
            console.log(err);
        }
    }
}

module.exports = {
    verify,
};
