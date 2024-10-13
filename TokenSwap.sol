// SPDX-License-Identifier: MIT

// File: @uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol


pragma solidity >=0.5.0;

/// @title Interface for Uniswap V3 Swap Callback
/// @notice Contracts interacting with Uniswap V3 pools must implement this interface for swap callbacks
interface IUniswapV3SwapCallback {
    /// @notice Invoked by the pool after executing a swap operation
    /// @dev The implementation must ensure settlement of the swap, verifying that the pool is authentic.
    /// The amounts of tokens sent or received can be zero if no swap occurred.
    /// @param token0Delta Amount of token0 that needs to be settled (positive = received, negative = sent).
    /// @param token1Delta Amount of token1 that needs to be settled (positive = received, negative = sent).
    /// @param data Custom data passed from the swap call.
    function uniswapV3SwapCallback(
        int256 token0Delta,
        int256 token1Delta,
        bytes calldata data
    ) external;
}

// File: @uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol


pragma solidity >=0.7.5;
pragma abicoder v2;

/// @title Interface for Token Swap Functionality via Uniswap V3
/// @notice Defines functions for single-hop and multi-hop token swaps
interface ISwapRouter is IUniswapV3SwapCallback {
    struct SwapSingleParams {
        address tokenFrom;
        address tokenTo;
        uint24 feeRate;
        address recipient;
        uint256 deadline;
        uint256 inputAmount;
        uint256 minOutputAmount;
        uint160 priceLimit;
    }

    /// @notice Swaps an exact input amount of one token for as much as possible of another.
    /// @param params The parameters for the token swap encoded as `SwapSingleParams`.
    /// @return amountReceived The amount of the token received from the swap.
    function swapExactInputSingle(SwapSingleParams calldata params) external payable returns (uint256 amountReceived);

    struct SwapMultiParams {
        bytes path;
        address to;
        uint256 deadline;
        uint256 inputAmount;
        uint256 minOutputAmount;
    }

    /// @notice Swaps an exact input amount of one token for as much as possible of another, using a multi-hop route.
    /// @param params The parameters for the multi-hop swap encoded as `SwapMultiParams`.
    /// @return amountReceived The amount of tokens received from the swap.
    function swapExactInputMulti(SwapMultiParams calldata params) external payable returns (uint256 amountReceived);

    struct SwapSingleExactOutputParams {
        address tokenFrom;
        address tokenTo;
        uint24 feeRate;
        address recipient;
        uint256 deadline;
        uint256 outputAmount;
        uint256 maxInputAmount;
        uint160 priceLimit;
    }

    /// @notice Swaps as few tokens as possible to receive a specified output amount of another token.
    /// @param params The parameters for the swap encoded as `SwapSingleExactOutputParams`.
    /// @return amountUsed The amount of input tokens used in the swap.
    function swapExactOutputSingle(SwapSingleExactOutputParams calldata params) external payable returns (uint256 amountUsed);

    struct SwapMultiExactOutputParams {
        bytes path;
        address to;
        uint256 deadline;
        uint256 outputAmount;
        uint256 maxInputAmount;
    }

    /// @notice Swaps as few tokens as possible to receive a specified output amount via a multi-hop route.
    /// @param params The parameters for the swap encoded as `SwapMultiExactOutputParams`.
    /// @return amountUsed The amount of input tokens used in the swap.
    function swapExactOutputMulti(SwapMultiExactOutputParams calldata params) external payable returns (uint256 amountUsed);
}

// File: @openzeppelin/contracts/token/ERC20/IERC20.sol


pragma solidity ^0.8.20;

/**
 * @dev Standard ERC20 interface as per EIP-20.
 */
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 amount);

    event Approval(address indexed owner, address indexed spender, uint256 amount);

    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// File: TokenExchange.sol


pragma solidity ^0.8.24;


/// @title SimpleTokenExchange
/// @notice A smart contract to perform basic token swaps using Uniswap V3
contract TokenExchange {
    ISwapRouter public router;
    address public wrappedNativeToken;

    /// @dev Constructor to set the Uniswap Router and wrapped native token addresses
    /// @param _router The address of the Uniswap router contract
    /// @param _wrappedNativeToken The address of the wrapped native token (e.g., WETH)
    constructor(address _router, address _wrappedNativeToken) {
        router = ISwapRouter(_router);
        wrappedNativeToken = _wrappedNativeToken;
    }

    /// @notice Performs a token swap with defined input and output tokens
    /// @dev Transfers tokens from sender to contract, approves Uniswap router, and executes swap
    /// @param inputToken The address of the token to swap from
    /// @param outputToken The address of the token to swap to
    /// @param inputAmount The amount of input token to swap
    /// @param minOutput The minimum acceptable amount of output token
    /// @param receiver The recipient of the output tokens
    function exchange(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 minOutput,
        address receiver
    ) external {
        // Move input tokens to this contract
        require(IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount), "Token transfer failed");

        // Approve the router to spend the input tokens
        require(IERC20(inputToken).approve(address(router), inputAmount), "Approval failed");

        // Set up parameters for the swap
        ISwapRouter.SwapSingleParams memory swapDetails = ISwapRouter.SwapSingleParams({
            tokenFrom: inputToken,
            tokenTo: outputToken,
            feeRate: 3000, // 0.3% fee
            recipient: receiver,
            deadline: block.timestamp,
            inputAmount: inputAmount,
            minOutputAmount: minOutput,
            priceLimit: 0
        });

        // Execute the swap via Uniswap
        uint256 outputAmount = router.swapExactInputSingle(swapDetails);

        // Ensure the swap results in sufficient output
        require(outputAmount >= minOutput, "Insufficient output");
    }
}
