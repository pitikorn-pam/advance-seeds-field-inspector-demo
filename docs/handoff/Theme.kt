/*
 * Theme.kt
 * Advance Seeds Field Inspector
 *
 * Generated from design-tokens.json v1.0.0
 * Drop into your :app or :designsystem module under com.advanceseeds.theme
 */

package com.advanceseeds.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// =================================================================
//                              COLORS
// =================================================================

object DSColors {
    // Brand
    val Brand          = Color(0xFF0F6E56)
    val BrandSoft      = Color(0xFFE1F5EE)
    val BrandDeep      = Color(0xFF04342C)
    val BrandDark      = Color(0xFF5DCAA5)   // Used for dark mode primary
    val BrandSoftDark  = Color(0xFF04342C)
    val BrandDeepDark  = Color(0xFF9FE1CB)
    val BrandOn        = Color(0xFFFFFFFF)

    // Surfaces
    val BgPrimary      = Color(0xFFFFFFFF)
    val BgSecondary    = Color(0xFFF4F4F1)
    val BgTertiary     = Color(0xFFFAFAF9)

    val BgPrimaryDark   = Color(0xFF0F0F11)
    val BgSecondaryDark = Color(0xFF18181B)
    val BgTertiaryDark  = Color(0xFF1F1F22)

    // Text
    val TextPrimary    = Color(0xFF1A1A1A)
    val TextSecondary  = Color(0xFF6B6B68)
    val TextTertiary   = Color(0xFF9D9D9A)

    val TextPrimaryDark   = Color(0xFFF5F5F4)
    val TextSecondaryDark = Color(0xFFA1A1A0)
    val TextTertiaryDark  = Color(0xFF727272)

    // Borders (overlay onto current surface)
    val BorderTertiary   = Color(0x0F000000) // 6% black
    val BorderSecondary  = Color(0x1F000000) // 12% black
    val BorderPrimary    = Color(0x33000000) // 20% black

    val BorderTertiaryDark   = Color(0x14FFFFFF) // 8% white
    val BorderSecondaryDark  = Color(0x29FFFFFF) // 16% white
    val BorderPrimaryDark    = Color(0x3DFFFFFF) // 24% white

    // Semantic
    val SuccessBg   = Color(0xFFEAF3DE)
    val SuccessText = Color(0xFF27500A)
    val WarningBg   = Color(0xFFFAEEDA)
    val WarningText = Color(0xFF633806)
    val DangerBg    = Color(0xFFFCEBEB)
    val DangerText  = Color(0xFF791F1F)
    val InfoBg      = Color(0xFFE6F1FB)
    val InfoText    = Color(0xFF0C447C)
}

// =================================================================
//                              SPACING
// =================================================================

object DSSpacing {
    val xs   = 4.dp
    val sm   = 8.dp
    val md   = 12.dp
    val lg   = 16.dp
    val xl   = 20.dp
    val xxl  = 24.dp
    val xxxl = 32.dp
    val x4l  = 40.dp
}

// =================================================================
//                               RADII
// =================================================================

object DSRadius {
    val sm   = 6.dp
    val md   = 10.dp
    val lg   = 14.dp
    val xl   = 18.dp
    val xxl  = 22.dp
    val full = 9999.dp
}

// =================================================================
//                            TYPOGRAPHY
// =================================================================

object DSType {
    val Display = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Medium, letterSpacing = (-0.6).sp)
    val H1      = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Medium, letterSpacing = (-0.22).sp)
    val H2      = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Medium)
    val Title   = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Medium)
    val Body    = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 21.sp)
    val Caption = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal)
    val Label   = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.44.sp)
}

// =================================================================
//                       COMPONENT DIMENSIONS
// =================================================================

object DSComponent {
    object Button   { val Height = 48.dp; val Radius = DSRadius.lg }
    object Input    { val Height = 48.dp; val Radius = DSRadius.md }
    object Card     { val Radius = DSRadius.xl }
    object StatTile { val Radius = DSRadius.lg }
    object TabBar   { val Height = 80.dp; val IconSize = 22.dp }
    object IconBtn  { val Size = 36.dp }
}

// =================================================================
//                    THEME ENVELOPE — wraps your app
// =================================================================

data class DSPalette(
    val brand: Color,
    val brandSoft: Color,
    val brandDeep: Color,
    val brandOn: Color,
    val bgPrimary: Color,
    val bgSecondary: Color,
    val bgTertiary: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val borderTertiary: Color,
    val borderSecondary: Color,
    val borderPrimary: Color
)

private val LightPalette = DSPalette(
    brand           = DSColors.Brand,
    brandSoft       = DSColors.BrandSoft,
    brandDeep       = DSColors.BrandDeep,
    brandOn         = DSColors.BrandOn,
    bgPrimary       = DSColors.BgPrimary,
    bgSecondary     = DSColors.BgSecondary,
    bgTertiary      = DSColors.BgTertiary,
    textPrimary     = DSColors.TextPrimary,
    textSecondary   = DSColors.TextSecondary,
    textTertiary    = DSColors.TextTertiary,
    borderTertiary  = DSColors.BorderTertiary,
    borderSecondary = DSColors.BorderSecondary,
    borderPrimary   = DSColors.BorderPrimary
)

private val DarkPalette = DSPalette(
    brand           = DSColors.BrandDark,
    brandSoft       = DSColors.BrandSoftDark,
    brandDeep       = DSColors.BrandDeepDark,
    brandOn         = DSColors.BrandDeep,
    bgPrimary       = DSColors.BgPrimaryDark,
    bgSecondary     = DSColors.BgSecondaryDark,
    bgTertiary      = DSColors.BgTertiaryDark,
    textPrimary     = DSColors.TextPrimaryDark,
    textSecondary   = DSColors.TextSecondaryDark,
    textTertiary    = DSColors.TextTertiaryDark,
    borderTertiary  = DSColors.BorderTertiaryDark,
    borderSecondary = DSColors.BorderSecondaryDark,
    borderPrimary   = DSColors.BorderPrimaryDark
)

val LocalDS = staticCompositionLocalOf { LightPalette }

@Composable
fun AdvanceSeedsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val palette = if (darkTheme) DarkPalette else LightPalette

    val materialColors = if (darkTheme) {
        darkColorScheme(
            primary = palette.brand,
            onPrimary = palette.brandOn,
            background = palette.bgPrimary,
            surface = palette.bgPrimary,
            onSurface = palette.textPrimary
        )
    } else {
        lightColorScheme(
            primary = palette.brand,
            onPrimary = palette.brandOn,
            background = palette.bgPrimary,
            surface = palette.bgPrimary,
            onSurface = palette.textPrimary
        )
    }

    val typography = Typography(
        displayLarge   = DSType.Display,
        headlineLarge  = DSType.H1,
        headlineMedium = DSType.H2,
        titleMedium    = DSType.Title,
        bodyLarge      = DSType.Body,
        bodySmall      = DSType.Caption,
        labelSmall     = DSType.Label
    )

    val shapes = Shapes(
        extraSmall = RoundedCornerShape(DSRadius.sm),
        small      = RoundedCornerShape(DSRadius.md),
        medium     = RoundedCornerShape(DSRadius.lg),
        large      = RoundedCornerShape(DSRadius.xl),
        extraLarge = RoundedCornerShape(DSRadius.xxl)
    )

    CompositionLocalProvider(LocalDS provides palette) {
        MaterialTheme(
            colorScheme = materialColors,
            typography = typography,
            shapes = shapes,
            content = content
        )
    }
}

/*
 * Usage:
 *
 * setContent {
 *     AdvanceSeedsTheme {
 *         val ds = LocalDS.current
 *         Text(
 *             "Hello, Jane",
 *             style = DSType.Display,
 *             color = ds.textPrimary
 *         )
 *     }
 * }
 */
