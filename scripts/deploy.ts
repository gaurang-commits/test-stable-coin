// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const ethUsdPrice = 1805;
  console.log(ethUsdPrice);
  const OracleFactory = await ethers.getContractFactory("Oracle");
  console.log("ethUsdPrice");
  const ethUsdOracle = await OracleFactory.deploy();
  console.log("ethUsdPrice");
  // await ethUsdOracle.setPrice(ethUsdPrice);
  console.log("ethUsdPrice");
  const IndCoinFactory = await ethers.getContractFactory("IndCoin");
  console.log(ethUsdOracle.address);
  const IndCoin = await IndCoinFactory.deploy(3, ethUsdOracle.address);
  await IndCoin.deployed();

  console.log("IND Coin deployed to:", IndCoin.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
