// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IStakingManager
 * @author pNetwork
 *
 * @notice
 */
interface IStakingManager {
    struct Stake {
        uint256 amount;
        uint64 startDate;
        uint64 endDate;
    }

    /**
     * @dev Emitted when an user increases his stake duration.
     *
     * @param owner The owner
     * @param duration The staking duration to add to the current one
     */
    event DurationIncreased(address indexed owner, uint64 duration);

    /**
     * @dev Emitted when an user stakes some tokens
     *
     * @param receiver The receiver
     * @param amount The staked amount
     * @param duration The staking duration
     */
    event Staked(address indexed receiver, uint256 amount, uint64 duration);

    /**
     * @dev Emitted when an user unstakes some tokens
     *
     * @param owner The Onwer
     * @param amount The unstaked amount
     */
    event Unstaked(address indexed owner, uint256 amount);

    /*
     * @notice Increase the duration of a stake.
     *
     * @param duration
     */
    function increaseDuration(uint64 duration) external;

    /*
     * @notice Stake an certain amount of tokens locked for a period of time in behalf of receiver.
     * in exchange of the governance token.
     *
     * @param receiver
     * @param amount
     * @param duration
     */
    function stake(address receiver, uint256 amount, uint64 duration) external;

    /*
     * @notice Returns the owner's stake data
     *
     * @param owner
     *
     * @return the Stake struct representing the owner's stake data.
     */
    function stakeOf(address owner) external view returns (Stake memory);

    /*
     * @notice Unstake an certain amount of governance token in exchange of the same amount of staked tokens.
     *         If the specified chainId is different than the chain where the DAO is deployed, the function will trigger a pToken redeem.
     *
     * @param amount
     * @param chainId
     *
     */
    function unstake(uint256 amount, bytes4 chainId) external;

    /*
     * @notice Unstake an certain amount of governance token in exchange of the same amount of staked tokens and send them to 'receiver'.
     *         This function is used togheter with onlyForwarder. If the specified chainId is different than the chain where the
     *         DAO is deployed, the function will trigger a pToken redeem.
     *
     * @param owner
     * @param amount
     * @param chainId
     *
     */
    function unstake(address owner, uint256 amount, bytes4 chainId) external;
}
