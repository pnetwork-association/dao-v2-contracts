// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface ITokenManager {
    function mint(address receiver, uint256 amount) external;

    function burn(address holder, uint256 amount) external;

    function token() external returns (address);
}
