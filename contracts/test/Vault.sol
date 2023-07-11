// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.17;

// Be sure to use this contract in a forked environment where the real implementation is already deployed
contract Vault {
    event VaultTransfer(address indexed token, address indexed to, uint256 amount);

    function deposit(address _token, uint256 _value) external payable {}

    function transfer(address _token, address _to, uint256 _value) external {}

    function balance(address _token) public view returns (uint256) {}

    function allowRecoverability(address) public view returns (bool) {}
}
