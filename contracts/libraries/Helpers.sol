// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Helpers {
    function truncate(uint256 value, uint256 precision) internal pure returns (uint24) {
        return uint24((value / 10 ** (18 - precision)) & 0xFFFFFF);
    }
}
