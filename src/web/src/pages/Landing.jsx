import React from 'react';
import Hero from '../components/Hero.jsx';
import FeatureStrip from '../components/FeatureStrip.jsx';
import CategoryChips from '../components/CategoryChips.jsx';
import CardCarousel from '../components/CardCarousel.jsx';

export default function Landing(){
  const bestSellers = [
    { id:1, title:'Sofa', price:'₱18,990', img:'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=800' },
    { id:2, title:'Chesterfield Sofa', price:'₱24,500', img:'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800' },
    { id:3, title:'Armchair', price:'₱7,990', img:'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800' },
    { id:4, title:'Coffee Table', price:'₱4,990', img:'https://images.unsplash.com/photo-1532372320978-54c1b7c59e95?w=800' },
  ];

  const collections = [
    { id:1, title:'Comfort Core Collection', img:'https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?w=800' },
    { id:2, title:'Social Sitting Collection', img:'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=800' },
    { id:3, title:'Rest & Recharge', img:'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800' },
    { id:4, title:'Sit & Stay', img:'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800' },
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
        <h2>Our <span className="muted">Best</span> Sellers!</h2>
        <CardCarousel items={bestSellers} type="product" />
      </section>

      <section id="collections" className="container section">
        <h2>Our <span className="muted">Collection</span>!</h2>
        <CardCarousel items={collections} type="collection" />
      </section>
    </>
  );
}
