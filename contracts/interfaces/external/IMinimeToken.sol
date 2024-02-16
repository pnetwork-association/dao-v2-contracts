// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMinimeToken is IERC20 {
    function balanceOfAt(address _owner, uint _blockNumber) external returns (uint);

    function totalSupplyAt(uint _blockNumber) external returns (uint);
}
