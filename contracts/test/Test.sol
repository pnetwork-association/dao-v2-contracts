// SPDX-License-Identifier: Unlicense

pragma solidity 0.8.17;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Test is Initializable, UUPSUpgradeable {
    function initialize() public initializer {
        __UUPSUpgradeable_init();
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal override {}
}
