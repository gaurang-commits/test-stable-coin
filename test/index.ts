import { expect } from "chai";
import { ethers } from "hardhat";
import { DepositorCoin } from "../typechain";
import { IndCoin } from "../typechain/IndCoin";

describe("IndCoin", function () {
  let ethUsdPrice: number, feeRatePercentage: number;
  let IndCoin: IndCoin;

  this.beforeEach(async () => {
    feeRatePercentage = 3;
    ethUsdPrice = 1804.99;

    const OracleFactory = await ethers.getContractFactory("Oracle");
    const ethUsdOracle = await OracleFactory.deploy();
    await ethUsdOracle.setPrice(ethUsdPrice);

    const IndCoinFactory = await ethers.getContractFactory("IndCoin");
    IndCoin = await IndCoinFactory.deploy(
      feeRatePercentage,
      ethUsdOracle.address
    );
    await IndCoin.deployed();
  });

  it("Should set fee rate percentage", async function () {
    expect(await IndCoin.feeRatePercentage()).to.equal(feeRatePercentage);
  });

  it("Should allow minting", async function () {
    const ethAmount = 1;
    const expectedMintAmount = ethAmount * ethUsdPrice;

    await IndCoin.mint({
      value: ethers.utils.parseEther(ethAmount.toString()),
    });
  
    expect(await IndCoin.totalSupply()).to.equal(
      ethers.utils.parseEther(expectedMintAmount.toString())
    );
  });

  describe("With minted tokens", function () {
    let mintAmount: number;

    this.beforeEach(async () => {
      const ethAmount = 1;
      mintAmount = ethAmount * ethUsdPrice;

      await IndCoin.mint({
        value: ethers.utils.parseEther(ethAmount.toString()),
      });
    });

    it("Should allow burning", async function () {
      const remainingIndCoinAmount = 100;
      await IndCoin.burn(
        ethers.utils.parseEther(
          (mintAmount - remainingIndCoinAmount).toString()
        )
      );

      expect(await IndCoin.totalSupply()).to.equal(
        ethers.utils.parseEther(remainingIndCoinAmount.toString())
      );
    });

    it("Should prevent depositing collateral buffer below minimum", async function () {
      const expectedMinimumAmount = 0.1; // 10% one 1 ETH
      const IndCoinCollateralBuffer = 0.05; // less than minimum

      await expect(
        IndCoin.depositCollateralBuffer({
          value: ethers.utils.parseEther(IndCoinCollateralBuffer.toString()),
        })
      ).to.be.revertedWith(
        `custom error 'InitialCollateralRatioError("IND: Initial collateral ratio not met, minimum is ", ` +
          ethers.utils.parseEther(expectedMinimumAmount.toString()) +
          ")'"
      );
    });

    it("Should allow depositing collateral buffer", async function () {
      const IndCoinCollateralBuffer = 0.5;
      await IndCoin.depositCollateralBuffer({
        value: ethers.utils.parseEther(IndCoinCollateralBuffer.toString()),
      });

      const DepositorCoinFactory = await ethers.getContractFactory(
        "DepositorCoin"
      );
      const DepositorCoin = await DepositorCoinFactory.attach(
        await IndCoin.depositorCoin()
      );

      const newInitialSurplusInUsd = IndCoinCollateralBuffer * ethUsdPrice;
      expect(await DepositorCoin.totalSupply()).to.equal(
        ethers.utils.parseEther(newInitialSurplusInUsd.toString())
      );
    });

    describe("With deposited collateral buffer", function () {
      let IndCoinCollateralBuffer: number;
      let DepositorCoin: DepositorCoin;

      this.beforeEach(async () => {
        IndCoinCollateralBuffer = 0.5;
        await IndCoin.depositCollateralBuffer({
          value: ethers.utils.parseEther(IndCoinCollateralBuffer.toString()),
        });

        const DepositorCoinFactory = await ethers.getContractFactory(
          "DepositorCoin"
        );
        DepositorCoin = await DepositorCoinFactory.attach(
          await IndCoin.depositorCoin()
        );
      });

      it("Should allow withdrawing collateral buffer", async function () {
        const newDepositorTotalSupply =
          IndCoinCollateralBuffer * ethUsdPrice;
        const IndCoinCollateralBurnAmount = newDepositorTotalSupply * 0.2;

        await IndCoin.withdrawCollateralBuffer(
          ethers.utils.parseEther(IndCoinCollateralBurnAmount.toString())
        );

        expect(await DepositorCoin.totalSupply()).to.equal(
          ethers.utils.parseEther(
            (
              newDepositorTotalSupply - IndCoinCollateralBurnAmount
            ).toString()
          )
        );
      });
    });
  });
});