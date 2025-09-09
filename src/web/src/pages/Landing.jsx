import React from 'react';
import Hero from '../components/Hero.jsx';
import FeatureStrip from '../components/FeatureStrip.jsx';
import CategoryChips from '../components/CategoryChips.jsx';
import CardCarousel from '../components/CardCarousel.jsx';
import HomepageSections from '../components/HomepageSections.jsx';
import comImg from "../assets/Com.png"
import sitImg from "../assets/sit.png"
import restImg from "../assets/rest.png"
import soctImg from "../assets/socsit.png"


export default function Landing(){
  const bestSellers = [
    { id:1, title:'Sofa', price:'₱18,990', img:'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=800' },
    { id:2, title:'Chesterfield Sofa', price:'₱24,500', img:'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800' },
    { id:3, title:'Armchair', price:'₱7,990', img:'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800' },
    { id:4, title:'Coffee Table', price:'₱4,990', img:'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800' }
  ];

  const collections = [
    { id:1, title:'Comfort Core Collection', img:comImg,  description: 'Experience unmatched comfort with cozy sofas and recliners designed for everyday relaxation.'  },
    { id:2, title:'Social Sitting Collection', img:soctImg, description: 'Perfect for gatherings, this collection offers stylish seating that brings people together.' },
    { id:3, title:'Rest & Recharge', img:restImg, description: 'Beds and loungers made for ultimate rest, giving you the energy to face each day refreshed.'  },
    { id:4, title:'Sit & Stay', img:sitImg, description: 'Durable and versatile chairs and benches built for long-lasting comfort and style.'  }
  ];

  return (
    <>
      <section id="hero" className="container">
        <Hero />
        <FeatureStrip />
        <div className="section">
          <CategoryChips />
        </div>
      </section>

      <section id="best-sellers" className="container section">
        <h2>Our <span className="muteds">Best </span>Sellers!</h2>
        <CardCarousel items={bestSellers} type="product" />
      </section>

      <section id="collections" className="container section">
        <h2>Our <span className="muteds">Collections</span>!</h2>
        <CardCarousel items={collections} type="collection" />
      </section>

      <section id="homepage" className="container section">
        <HomepageSections items={collections} type="collection" />
      </section>
    </>
  );
}
