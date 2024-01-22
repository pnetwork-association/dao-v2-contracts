// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        // Mint initial supply to the deployer
        _mint(msg.sender, 10000000 * (10**18)); // Mint 1,000,000 tokens with 18 decimal places
    }
}
