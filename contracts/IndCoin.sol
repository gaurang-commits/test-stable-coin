// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {ERC20} from "./ERC20.sol";
import {DepositorCoin} from "./DepositorCoin.sol";
import {Oracle} from "./Oracle.sol";
import {WadLib} from "./WadLib.sol";

contract IndCoin is ERC20 {
    using WadLib for uint256;

    error InitialCollateralRatioError(
        string message,
        uint256 minimumDepositAmount
    );

    DepositorCoin public depositorCoin;
    Oracle public oracle;
    uint256 public feeRatePercentage;
    uint256 public constant INITIAL_COLLATERAL_RATIO_PERCENTAGE = 10;

    constructor(uint256 _feeRatePercentage, Oracle _oracle)
        ERC20("IndCoin", "IND")
    {
        feeRatePercentage = _feeRatePercentage;
        oracle = _oracle;
    }

    function mint() external payable {
        uint256 fee = _getFee(msg.value);
        uint256 remainingEth = msg.value - fee;

        uint256 mintIndCoinAmount = remainingEth * oracle.getPrice();
        _mint(msg.sender, mintIndCoinAmount);
    }

    function burn(uint256 burnIndCoinAmount) external {
        int256 deficitOrSurplusInUsd = _getDeficitOrSurplusInContractInUsd();
        require(
            deficitOrSurplusInUsd >= 0,
            "IND: Cannot burn while in deficit"
        );

        _burn(msg.sender, burnIndCoinAmount);

        uint256 refundingEth = burnIndCoinAmount / oracle.getPrice();
        uint256 fee = _getFee(refundingEth);
        uint256 remainingRefundingEth = refundingEth - fee;

        (bool success, ) = msg.sender.call{value: remainingRefundingEth}("");
        require(success, "IND: Burn refund transaction failed");
    }

    function _getFee(uint256 ethAmount) private view returns (uint256) {
        bool hasDepositors = address(depositorCoin) != address(0) &&
            depositorCoin.totalSupply() > 0;
        if (!hasDepositors) {
            return 0;
        }

        return (feeRatePercentage * ethAmount) / 100;
    }

    function depositCollateralBuffer() external payable {
        int256 deficitOrSurplusInUsd = _getDeficitOrSurplusInContractInUsd();

        if (deficitOrSurplusInUsd <= 0) {
            uint256 deficitInUsd = uint256(deficitOrSurplusInUsd * -1);
            uint256 usdInEthPrice = oracle.getPrice();
            uint256 deficitInEth = deficitInUsd / usdInEthPrice;

            uint256 requiredInitialSurplusInUsd = (INITIAL_COLLATERAL_RATIO_PERCENTAGE *
                    totalSupply) / 100;
            uint256 requiredInitialSurplusInEth = requiredInitialSurplusInUsd /
                usdInEthPrice;

            if (msg.value < deficitInEth + requiredInitialSurplusInEth) {
                uint256 minimumDepositAmount = deficitInEth +
                    requiredInitialSurplusInEth;
                revert InitialCollateralRatioError(
                    "IND: Initial collateral ratio not met, minimum is ",
                    minimumDepositAmount
                );
            }

            uint256 newInitialSurplusInEth = msg.value - deficitInEth;
            uint256 newInitialSurplusInUsd = newInitialSurplusInEth *
                usdInEthPrice;

            depositorCoin = new DepositorCoin();
            uint256 mintDepostorCoinAmount = newInitialSurplusInUsd;
            depositorCoin.mint(msg.sender, mintDepostorCoinAmount);

            return;
        }

        uint256 surplusInUsd = uint256(deficitOrSurplusInUsd);
        WadLib.Wad dpcInUsdPrice = _getDPCinUsdPrice(surplusInUsd);
        uint256 mintDepositorCoinAmount = ((msg.value.mulWad(dpcInUsdPrice)) /
            oracle.getPrice());

        depositorCoin.mint(msg.sender, mintDepositorCoinAmount);
    }

    function withdrawCollateralBuffer(uint256 burnDepositorCoinAmount)
        external
    {
        require(
            depositorCoin.balanceOf(msg.sender) >= burnDepositorCoinAmount,
            "IND: Sender has insuffient DPC funds"
        );

        depositorCoin.burn(msg.sender, burnDepositorCoinAmount);

        int256 deficitOrSurplusInUsd = _getDeficitOrSurplusInContractInUsd();
        require(deficitOrSurplusInUsd > 0, "IND: No funds to withdraw");

        uint256 surplusInUsd = uint256(deficitOrSurplusInUsd);
        WadLib.Wad dpcInUsdPrice = _getDPCinUsdPrice(surplusInUsd);
        uint256 refundingUsd = burnDepositorCoinAmount.mulWad(dpcInUsdPrice);
        uint256 refundingEth = refundingUsd / oracle.getPrice();

        (bool success, ) = msg.sender.call{value: refundingEth}("");
        require(success, "IND: Withdraw refund transaction failed");
    }

    function _getDeficitOrSurplusInContractInUsd()
        private
        view
        returns (int256)
    {
        uint256 ethContractBalanceInUsd = (address(this).balance - msg.value) *
            oracle.getPrice();
        uint256 totalIndCoinBalanceInUsd = totalSupply;
        int256 deficitOrSurplus = int256(ethContractBalanceInUsd) -
            int256(totalIndCoinBalanceInUsd);

        return deficitOrSurplus;
    }

    function _getDPCinUsdPrice(uint256 surplusInUsd)
        private
        view
        returns (WadLib.Wad)
    {
        return WadLib.fromFraction(depositorCoin.totalSupply(), surplusInUsd);
    }
}