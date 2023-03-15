// SPDX-License-Identifier: Unlicense

pragma solidity 0.8.17;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TestV2 is Initializable, UUPSUpgradeable {
    function initialize() public initializer {
        __UUPSUpgradeable_init();
    }

    function version() external pure returns (uint256) {
        return 2;
    }

    function _authorizeUpgrade(address) internal override {}
}
