//
//  DesignTokens.swift
//  Advance Seeds Field Inspector
//
//  Generated from design-tokens.json v1.0.0
//  Do not edit by hand — regenerate from the JSON source.
//

import SwiftUI

public enum DS {

    // MARK: - Color

    public enum Colors {

        // Brand
        public static let brand     = Color("DSBrand",     bundle: .main)   // #0F6E56 light / #5DCAA5 dark
        public static let brandSoft = Color("DSBrandSoft", bundle: .main)   // #E1F5EE light / #04342C dark
        public static let brandDeep = Color("DSBrandDeep", bundle: .main)   // #04342C light / #9FE1CB dark
        public static let brandOn   = Color.white                           // Text on brand fill

        // Surfaces
        public static let bgPrimary   = Color("DSBgPrimary",   bundle: .main)
        public static let bgSecondary = Color("DSBgSecondary", bundle: .main)
        public static let bgTertiary  = Color("DSBgTertiary",  bundle: .main)

        // Text
        public static let textPrimary   = Color("DSTextPrimary",   bundle: .main)
        public static let textSecondary = Color("DSTextSecondary", bundle: .main)
        public static let textTertiary  = Color("DSTextTertiary",  bundle: .main)

        // Borders (use as overlays at given opacity)
        public static let borderTertiary  = Color.primary.opacity(0.06)
        public static let borderSecondary = Color.primary.opacity(0.12)
        public static let borderPrimary   = Color.primary.opacity(0.20)

        // Semantic
        public enum Success {
            public static let bg   = Color(hex: 0xEAF3DE)
            public static let text = Color(hex: 0x27500A)
        }
        public enum Warning {
            public static let bg   = Color(hex: 0xFAEEDA)
            public static let text = Color(hex: 0x633806)
        }
        public enum Danger {
            public static let bg   = Color(hex: 0xFCEBEB)
            public static let text = Color(hex: 0x791F1F)
        }
        public enum Info {
            public static let bg   = Color(hex: 0xE6F1FB)
            public static let text = Color(hex: 0x0C447C)
        }
    }

    // MARK: - Spacing (multiples of 4)

    public enum Space {
        public static let xs:  CGFloat = 4
        public static let sm:  CGFloat = 8
        public static let md:  CGFloat = 12
        public static let lg:  CGFloat = 16
        public static let xl:  CGFloat = 20
        public static let xxl: CGFloat = 24
        public static let xxxl: CGFloat = 32
        public static let xxxxl: CGFloat = 40
    }

    // MARK: - Radius

    public enum Radius {
        public static let sm:  CGFloat = 6
        public static let md:  CGFloat = 10
        public static let lg:  CGFloat = 14
        public static let xl:  CGFloat = 18
        public static let xxl: CGFloat = 22
        public static let full: CGFloat = 9999
    }

    // MARK: - Typography

    public enum Type {
        public static let display = Font.system(size: 30, weight: .medium).leading(.tight)
        public static let h1      = Font.system(size: 22, weight: .medium)
        public static let h2      = Font.system(size: 18, weight: .medium)
        public static let title   = Font.system(size: 15, weight: .medium)
        public static let body    = Font.system(size: 14, weight: .regular)
        public static let caption = Font.system(size: 12, weight: .regular)
        public static let label   = Font.system(size: 11, weight: .medium)
        public static let mono    = Font.system(size: 12, weight: .regular, design: .monospaced)
    }

    // MARK: - Component dimensions

    public enum Component {
        public enum Button {
            public static let height: CGFloat = 48
            public static let radius: CGFloat = 14
        }
        public enum Input {
            public static let height: CGFloat = 48
            public static let radius: CGFloat = 12
        }
        public enum Card {
            public static let radius: CGFloat = 18
        }
        public enum StatTile {
            public static let radius: CGFloat = 14
        }
        public enum TabBar {
            public static let height: CGFloat = 80
            public static let iconSize: CGFloat = 22
        }
        public enum IconButton {
            public static let size: CGFloat = 36
        }
    }

    // MARK: - Motion

    public enum Motion {
        public static let durationFast:   Double = 0.12
        public static let durationNormal: Double = 0.22
        public static let durationSlow:   Double = 0.32
    }
}

// MARK: - Color hex initializer

public extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8)  & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

// MARK: - Reusable view modifiers

public extension View {

    /// Apply standard card styling: white surface, hairline border, lg radius.
    func dsCard(padding: CGFloat = DS.Space.lg) -> some View {
        self
            .padding(padding)
            .background(DS.Colors.bgPrimary)
            .overlay(
                RoundedRectangle(cornerRadius: DS.Component.Card.radius)
                    .stroke(DS.Colors.borderTertiary, lineWidth: 0.5)
            )
            .clipShape(RoundedRectangle(cornerRadius: DS.Component.Card.radius))
    }

    /// Apply primary brand button styling.
    func dsPrimaryButton() -> some View {
        self
            .font(.system(size: 15, weight: .medium))
            .foregroundColor(DS.Colors.brandOn)
            .frame(maxWidth: .infinity)
            .frame(height: DS.Component.Button.height)
            .background(DS.Colors.brand)
            .clipShape(RoundedRectangle(cornerRadius: DS.Component.Button.radius))
    }
}

/*
   Asset catalog setup
   -------------------
   Add a Color Set in Assets.xcassets for each "DSXxx" color above.
   Each color set should have two appearances:

     DSBrand        Light: #0F6E56   Dark: #5DCAA5
     DSBrandSoft    Light: #E1F5EE   Dark: #04342C
     DSBrandDeep    Light: #04342C   Dark: #9FE1CB
     DSBgPrimary    Light: #FFFFFF   Dark: #0F0F11
     DSBgSecondary  Light: #F4F4F1   Dark: #18181B
     DSBgTertiary   Light: #FAFAF9   Dark: #1F1F22
     DSTextPrimary  Light: #1A1A1A   Dark: #F5F5F4
     DSTextSecondary Light: #6B6B68  Dark: #A1A1A0
     DSTextTertiary Light: #9D9D9A   Dark: #727272
*/
